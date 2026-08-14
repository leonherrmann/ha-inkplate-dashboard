"""Bridges Home Assistant state into the device's MQTT topics.

The device has no Home Assistant credentials and no idea what an entity is
beyond the id written in its layout. This follows exactly the entities the
pushed layout references and republishes them, retained, so a device that
reboots or gets a new layout renders real values immediately instead of zeros.

Both the state and every scalar attribute are published; widgets like the
climate one need an attribute (the radiator's target `temperature`) rather than
the state itself, and publishing them all keeps the firmware free to ask for any
of them without the bridge needing to know which.
"""

import asyncio
import json
import logging
from typing import Any, Iterable

import aiohttp

from mqtt import link
from settings import HA_REST_URL, HA_WS_URL, SUPERVISOR_TOKEN

log = logging.getLogger(__name__)


class StateBridge:
    def __init__(self) -> None:
        self._entities: set[str] = set()
        self._task: asyncio.Task | None = None
        self._restart = asyncio.Event()

    def follow(self, entity_ids: Iterable[str]) -> None:
        """Point the bridge at a new set of entities, seeding them immediately."""
        entities = set(entity_ids)
        if entities == self._entities:
            return
        self._entities = entities
        log.info("Following %d entities", len(entities))
        self._restart.set()

    def start(self) -> None:
        if not SUPERVISOR_TOKEN:
            log.warning(
                "No SUPERVISOR_TOKEN, so the state bridge is off. "
                "Editing and pushing layouts still work; entity values will not update."
            )
            return
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    # -- internals ---------------------------------------------------------

    async def _run(self) -> None:
        while True:
            try:
                await self._seed()
                await self._listen()
            except asyncio.CancelledError:
                raise
            except Exception as error:  # noqa: BLE001 - keep the bridge alive
                log.warning("State bridge error (%s), retrying in 10s", error)
                await asyncio.sleep(10)

    async def _seed(self) -> None:
        """Publish current values once, so nothing waits for the next change."""
        if not self._entities:
            return
        headers = {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get(f"{HA_REST_URL}/states") as response:
                response.raise_for_status()
                for state in await response.json():
                    if state["entity_id"] in self._entities:
                        self._publish(state)

    async def _listen(self) -> None:
        headers = {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.ws_connect(HA_WS_URL, heartbeat=30) as socket:
                await self._authenticate(socket)
                await socket.send_json({"id": 1, "type": "subscribe_events", "event_type": "state_changed"})
                log.info("Subscribed to Home Assistant state changes")

                self._restart.clear()
                waiter = asyncio.create_task(self._restart.wait())

                while True:
                    receiver = asyncio.create_task(socket.receive())
                    done, _ = await asyncio.wait(
                        {receiver, waiter}, return_when=asyncio.FIRST_COMPLETED
                    )

                    if waiter in done:
                        # The layout changed; reseed against the new entity set
                        receiver.cancel()
                        return

                    message = receiver.result()
                    if message.type != aiohttp.WSMsgType.TEXT:
                        waiter.cancel()
                        return

                    event = json.loads(message.data)
                    if event.get("type") != "event":
                        continue
                    state = event["event"]["data"].get("new_state")
                    if state and state["entity_id"] in self._entities:
                        self._publish(state)

    async def _authenticate(self, socket: aiohttp.ClientWebSocketResponse) -> None:
        # HA sends auth_required first, then expects the token
        await socket.receive_json()
        await socket.send_json({"type": "auth", "access_token": SUPERVISOR_TOKEN})
        reply = await socket.receive_json()
        if reply.get("type") != "auth_ok":
            raise RuntimeError(f"Home Assistant rejected the token: {reply}")

    @staticmethod
    def _publish(state: dict[str, Any]) -> None:
        entity_id = state["entity_id"]
        link.publish_state(entity_id, str(state.get("state", "")))

        for key, value in (state.get("attributes") or {}).items():
            if isinstance(value, (str, int, float, bool)):
                link.publish_state(entity_id, str(value), attribute=key)


bridge = StateBridge()
