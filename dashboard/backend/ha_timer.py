"""Keeps a Home Assistant `timer` helper in step with the panel's timer.

The MQTT entities in discovery.py are the working parts -- a duration, start,
pause and cancel, and what the panel says it is doing. They are not a
`timer.*` entity, and cannot be: MQTT discovery has no timer platform, and a
timer helper is a config entry rather than something an add-on can publish
into being. So this creates one through Home Assistant's own API and mirrors
it, which is what makes the timer card and `timer.finished` work.

**The panel owns the timer.** Everything here is a mirror in one direction and
a request in the other: what the panel publishes is the truth, and a change
made to the helper is forwarded as a command and then waited for. That is the
same rule the settings override follows, and it is what keeps the panel
working with Home Assistant switched off.

## The loop, and why it terminates

Panel starts -> we call timer.start -> the helper changes -> we would command
the panel to start -> the panel publishes -> round again. Every mirror of two
stateful things has this, and a delay-based guard only makes it rarer.

Home Assistant hands out a *context* with every service call, and the state
change that call causes carries the same context id. So the ids of our own
calls are remembered for a moment, and a helper change carrying one of them is
recognised as our own echo and dropped. A change from anywhere else -- you
pressing the card, an automation -- has an id we have never seen, and is
forwarded. The loop cannot close because the only messages we act on are the
ones we did not cause.
"""

import asyncio
import json
import logging
import time
from typing import Any

import aiohttp

from settings import DEVICE_ID, HA_REST_URL, HA_WS_URL, SUPERVISOR_TOKEN, topics

log = logging.getLogger(__name__)

# The helper the add-on creates and keeps in step. Named after the device, so
# two panels on one Home Assistant do not fight over one timer.
HELPER_NAME = f"{DEVICE_ID} timer"
HELPER_ENTITY = f"timer.{DEVICE_ID}_timer"

# How many of our own context ids to remember. A handful covers any burst; they
# are only needed for the moment between the call and the state change it
# causes.
CONTEXT_MEMORY = 32

# How long after one of our own service calls a helper change is still assumed
# to be that call coming back. Covers the state change that Home Assistant
# emits before it answers the call and that arrives after it.
SETTLE_SECONDS = 2.0

# How far the helper's remaining may sit from the panel's and still count as
# the same timer. They both count down and a round trip takes a moment.
ECHO_SLACK_SECONDS = 5


def _now() -> float:
    """Monotonic, so the guards survive the clock being set."""
    return time.monotonic()


class TimerMirror:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        # The loop the add-on runs on. on_panel_timer is called from paho's
        # own network thread, where asyncio.create_task raises "no running
        # event loop" -- so the loop is captured here and work is handed to it
        # with run_coroutine_threadsafe instead.
        self._loop: asyncio.AbstractEventLoop | None = None
        self._ours: list[str] = []
        self._last_panel: dict[str, Any] = {}
        self._publish_command = None
        self._ws_id = 10
        # How many of our own service calls are in the air. The context guard
        # alone cannot cover them: Home Assistant emits the state change before
        # it answers the HTTP call, so the event routinely arrives while _call
        # is still reading the response it would learn the context from. See
        # _on_helper_event.
        self._calls_in_flight = 0
        # Monotonic time until which helper changes are still treated as ours,
        # for the event that arrives just after the call has been answered.
        self._settled_until = 0.0
        # What the panel last had us mirror, as (state, ends_at). A republish
        # saying the same thing needs no service call -- see _mirror_to_helper.
        self._mirrored: tuple[Any, Any] | None = None

    def start(self, publish_command) -> None:
        """`publish_command` sends a JSON command to the device."""
        if not SUPERVISOR_TOKEN:
            log.info("No SUPERVISOR_TOKEN, so the timer helper is not mirrored")
            return
        self._publish_command = publish_command
        self._loop = asyncio.get_running_loop()
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    # -- the panel's side --------------------------------------------------

    def on_panel_timer(self, payload: str) -> None:
        """Called with whatever the device published on its timer topic."""
        try:
            state = json.loads(payload)
        except ValueError:
            return
        if state == self._last_panel:
            return
        self._last_panel = state
        if self._loop:
            # From paho's thread onto the add-on's loop. create_task here threw
            # every time, so the helper never followed the panel at all.
            asyncio.run_coroutine_threadsafe(
                self._mirror_to_helper(state), self._loop
            )

    async def _mirror_to_helper(self, state: dict[str, Any]) -> None:
        what = state.get("state")

        # Only when the panel has actually *changed* something. It republishes
        # every 30 seconds to keep the retained message fresh, and the payload
        # differs each time because `remaining` counts down -- so this used to
        # call timer.start on every one of them, restarting the helper's own
        # countdown twice a minute and taking another run at the race in
        # _on_helper_event for no reason at all. A timer is fully described by
        # what it is doing and when it ends; if neither moved there is nothing
        # to say.
        key = (what, state.get("ends_at"))
        if key == self._mirrored:
            return
        self._mirrored = key

        try:
            if what == "running":
                # Started with what is *left*, not the original duration: this
                # also fires when the panel is resumed, or when Home Assistant
                # reconnects to a timer already half run down, and in both the
                # helper has to agree with the panel rather than restart it.
                remaining = int(state.get("remaining") or 0)
                if remaining > 0:
                    await self._call("timer.start", {"duration": remaining})
            elif what == "paused":
                await self._call("timer.pause", {})
            else:
                # idle, finished, or a pomodoro running -- nothing for the
                # plain timer to be doing.
                await self._call("timer.cancel", {})
        except Exception as error:  # a mirror failing must not stop the add-on
            # Forgotten, not remembered: a call that did not happen has left
            # the helper out of step, and the skip above would otherwise hold
            # it there until the panel next changes something of its own.
            self._mirrored = None
            log.warning("Could not mirror the timer to Home Assistant: %s", error)

    def _log_panel(self, state: dict[str, Any]) -> None:
        log.info("Panel timer is %s", state.get("state"))

    # -- Home Assistant's side ---------------------------------------------

    async def _run(self) -> None:
        while True:
            try:
                await self._ensure_helper()
                await self._listen()
            except asyncio.CancelledError:
                raise
            except Exception as error:
                log.warning("Timer mirror lost Home Assistant: %s", error)
            await asyncio.sleep(10)

    async def _ensure_helper(self) -> None:
        """Creates the helper if it is not there. Idempotent."""
        headers = {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get(
                f"{HA_REST_URL}/states/{HELPER_ENTITY}", timeout=20
            ) as response:
                if response.status == 200:
                    return
                if response.status != 404:
                    response.raise_for_status()

        # Created through the websocket collection API, which is what the
        # Helpers page uses. There is no REST route for making one.
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.ws_connect(HA_WS_URL, heartbeat=30) as socket:
                await self._authenticate(socket)
                await socket.send_json(
                    {
                        "id": self._next_id(),
                        "type": "timer/create",
                        "name": HELPER_NAME,
                        "duration": 0,
                    }
                )
                reply = await socket.receive_json()
                if reply.get("success"):
                    log.info("Created %s to mirror the panel's timer", HELPER_ENTITY)
                else:
                    log.warning("Could not create the timer helper: %s", reply)

    async def _listen(self) -> None:
        headers = {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.ws_connect(HA_WS_URL, heartbeat=30) as socket:
                await self._authenticate(socket)
                await socket.send_json(
                    {
                        "id": self._next_id(),
                        "type": "subscribe_events",
                        "event_type": "state_changed",
                    }
                )
                log.info("Mirroring %s", HELPER_ENTITY)
                # A fresh subscription may have missed changes, and the helper
                # can have been restarted with Home Assistant. Forget what was
                # mirrored so the panel's next publish is acted on rather than
                # skipped for matching a state the helper may no longer be in.
                self._mirrored = None

                while True:
                    message = await socket.receive()
                    if message.type != aiohttp.WSMsgType.TEXT:
                        return
                    event = json.loads(message.data)
                    if event.get("type") != "event":
                        continue
                    data = event["event"]["data"]
                    if data.get("entity_id") != HELPER_ENTITY:
                        continue

                    self._on_helper_event(event)

    def _on_helper_event(self, event: dict[str, Any]) -> bool:
        """One state_changed for the helper. True if it went on to the panel.

        Three things have to be true before a helper change is forwarded, and
        the first two are here because the third is not enough on its own.

        The panel reported on 2026-09-10 that pressing pause did not stop the
        timer, that the duration under the count kept changing and that the
        ring kept resetting. All three are one command: `timer_start` arriving
        while a timer runs restarts it, and the seconds it carries become the
        new duration. It was this loop sending it -- the panel publishes
        running, we call timer.start to match, that change comes back as
        somebody else's because its context had not been recorded yet, and we
        tell the panel to start. Round it goes, a little shorter each time.
        """
        data = event["event"]["data"]
        if data.get("entity_id") != HELPER_ENTITY:
            return False

        # 1. Not while one of our own calls is in the air, or in the moment
        #    after. Home Assistant fires the state change before it answers the
        #    call, so this arrives *before* _call has read the context out of
        #    the response -- which is exactly how the context guard below was
        #    losing, and it loses more often on a slow reply, not less.
        if self._calls_in_flight > 0 or _now() < self._settled_until:
            return False

        new_state = data.get("new_state") or {}
        what = new_state.get("state")

        # 2. Not when the helper is only repeating what the panel already says.
        #    The panel owns the timer, so a helper that agrees with it has
        #    nothing to tell it. This is what makes the loop impossible rather
        #    than unlikely: every message in it agreed with the panel.
        if self._agrees_with_panel(what, new_state):
            return False

        # 3. And not if we recognise the context as one of ours after all.
        context = event["event"].get("context") or {}
        if context.get("id") in self._ours:
            return False

        self._forward(what, new_state)
        return True

    def _agrees_with_panel(self, what: str | None, state: dict[str, Any]) -> bool:
        """Whether the helper is saying what the panel has already said."""
        panel = self._last_panel or {}
        panel_state = panel.get("state")

        if what == "active":
            if panel_state != "running":
                return False
            # Both count down, and a round trip takes a moment, so these agree
            # by being close rather than equal. Erring loose is the safe way
            # round: ignoring a start that asks for what is already running
            # costs nothing, and forwarding one is the loop above.
            remaining = _seconds(state.get("attributes", {}).get("remaining"))
            return abs(remaining - int(panel.get("remaining") or 0)) <= ECHO_SLACK_SECONDS
        if what == "paused":
            return panel_state == "paused"
        if what == "idle":
            return panel_state in (None, "", "idle", "finished")
        return False

    def _forward(self, what: str | None, state: dict[str, Any]) -> None:
        """A change somebody else made to the helper, sent on to the panel."""
        if not self._publish_command:
            return

        if what == "active":
            remaining = _seconds(state.get("attributes", {}).get("remaining"))
            command = {"action": "timer_start"}
            if remaining:
                command["seconds"] = remaining
            log.info("Home Assistant started the timer; telling the panel")
            self._publish_command(command)
        elif what == "paused":
            log.info("Home Assistant paused the timer; telling the panel")
            self._publish_command({"action": "timer_pause"})
        elif what == "idle":
            log.info("Home Assistant cancelled the timer; telling the panel")
            self._publish_command({"action": "timer_cancel"})

    async def _call(self, service: str, data: dict[str, Any]) -> None:
        domain, name = service.split(".", 1)
        headers = {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}
        body = dict(data)
        body["entity_id"] = HELPER_ENTITY
        # Raised before the request goes out and lowered only after the settle
        # window is armed, so there is no instant in which a change we caused
        # could be read as somebody else's. See _on_helper_event.
        self._calls_in_flight += 1
        try:
            async with aiohttp.ClientSession(headers=headers) as session:
                async with session.post(
                    f"{HA_REST_URL}/services/{domain}/{name}",
                    json=body,
                    timeout=20,
                ) as response:
                    response.raise_for_status()
                    changed = await response.json()
        finally:
            self._settled_until = _now() + SETTLE_SECONDS
            self._calls_in_flight -= 1

        # Remember the context of what that call changed, so the state change
        # it causes is recognised as ours and not sent back to the panel.
        for state in changed if isinstance(changed, list) else []:
            context = state.get("context") or {}
            if context.get("id"):
                self._ours.append(context["id"])
        del self._ours[:-CONTEXT_MEMORY]

    async def _authenticate(self, socket: aiohttp.ClientWebSocketResponse) -> None:
        await socket.receive_json()
        await socket.send_json({"type": "auth", "access_token": SUPERVISOR_TOKEN})
        reply = await socket.receive_json()
        if reply.get("type") != "auth_ok":
            raise RuntimeError(f"Home Assistant rejected the token: {reply}")

    def _next_id(self) -> int:
        self._ws_id += 1
        return self._ws_id


def _seconds(value: Any) -> int:
    """Home Assistant writes a timer's remaining time as H:MM:SS."""
    if not value:
        return 0
    try:
        parts = [int(float(part)) for part in str(value).split(":")]
    except ValueError:
        return 0
    total = 0
    for part in parts:
        total = total * 60 + part
    return total


mirror = TimerMirror()
