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


class TimerMirror:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._ours: list[str] = []
        self._last_panel: dict[str, Any] = {}
        self._publish_command = None
        self._ws_id = 10

    def start(self, publish_command) -> None:
        """`publish_command` sends a JSON command to the device."""
        if not SUPERVISOR_TOKEN:
            log.info("No SUPERVISOR_TOKEN, so the timer helper is not mirrored")
            return
        self._publish_command = publish_command
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
        if self._task:
            asyncio.create_task(self._mirror_to_helper(state))

    async def _mirror_to_helper(self, state: dict[str, Any]) -> None:
        what = state.get("state")
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
            log.warning("Could not mirror the timer to Home Assistant: %s", error)

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

                    context = event["event"].get("context") or {}
                    if context.get("id") in self._ours:
                        # Our own call coming back. Forwarding it would start
                        # the loop this class exists to avoid.
                        continue

                    new_state = data.get("new_state") or {}
                    self._forward(new_state.get("state"), new_state)

    def _forward(self, what: str | None, state: dict[str, Any]) -> None:
        """A change somebody else made to the helper, sent on to the panel."""
        if not self._publish_command:
            return

        if what == "active":
            remaining = _seconds(state.get("attributes", {}).get("remaining"))
            command = {"action": "timer_start"}
            if remaining:
                command["seconds"] = remaining
            self._publish_command(command)
        elif what == "paused":
            self._publish_command({"action": "timer_pause"})
        elif what == "idle":
            self._publish_command({"action": "timer_cancel"})

    async def _call(self, service: str, data: dict[str, Any]) -> None:
        domain, name = service.split(".", 1)
        headers = {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}
        body = dict(data)
        body["entity_id"] = HELPER_ENTITY
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.post(
                f"{HA_REST_URL}/services/{domain}/{name}",
                json=body,
                timeout=20,
            ) as response:
                response.raise_for_status()
                changed = await response.json()

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
