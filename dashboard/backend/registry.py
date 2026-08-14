"""Entity list enriched with the area each entity belongs to.

Home Assistant does not put the area on the state object: it lives in the area
registry, and an entity reaches it either directly or through its device. The
picker groups by area, so those three registries get joined here.

Registry reads are websocket-only, so this opens its own short-lived connection
rather than sharing the bridge's long-running one, and caches the result.
"""

import logging
import time
from typing import Any

import aiohttp

from settings import HA_WS_URL, SUPERVISOR_TOKEN

log = logging.getLogger(__name__)

CACHE_SECONDS = 300


class Registry:
    def __init__(self) -> None:
        self._areas: dict[str, str] = {}
        self._fetched_at: float = 0.0

    async def entities(self, states: list[dict[str, Any]]) -> list[dict[str, str]]:
        """Entities from `states`, annotated with domain and area name."""
        areas_by_entity = await self._areas_by_entity()

        return [
            {
                "entity_id": state["entity_id"],
                "name": (state.get("attributes") or {}).get("friendly_name", state["entity_id"]),
                "domain": state["entity_id"].split(".", 1)[0],
                "area": areas_by_entity.get(state["entity_id"], ""),
            }
            for state in states
        ]

    async def _areas_by_entity(self) -> dict[str, str]:
        if self._areas and (time.time() - self._fetched_at) < CACHE_SECONDS:
            return self._areas

        if not SUPERVISOR_TOKEN:
            return {}

        try:
            self._areas = await self._fetch()
            self._fetched_at = time.time()
        except Exception as error:  # noqa: BLE001 - the picker still works unarea'd
            log.warning("Could not read the area registry (%s); areas will be blank", error)
            return {}

        return self._areas

    async def _fetch(self) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.ws_connect(HA_WS_URL, heartbeat=30) as socket:
                await socket.receive_json()  # auth_required
                await socket.send_json({"type": "auth", "access_token": SUPERVISOR_TOKEN})
                reply = await socket.receive_json()
                if reply.get("type") != "auth_ok":
                    raise RuntimeError(f"Home Assistant rejected the token: {reply}")

                areas = await self._command(socket, 1, "config/area_registry/list")
                devices = await self._command(socket, 2, "config/device_registry/list")
                entities = await self._command(socket, 3, "config/entity_registry/list")

        area_names = {area["area_id"]: area["name"] for area in areas}
        device_areas = {device["id"]: device.get("area_id") for device in devices}

        mapping: dict[str, str] = {}
        for entry in entities:
            # An entity's own area_id wins; otherwise it inherits its device's
            area_id = entry.get("area_id") or device_areas.get(entry.get("device_id"))
            if area_id:
                mapping[entry["entity_id"]] = area_names.get(area_id, "")

        log.info("Resolved areas for %d entities", len(mapping))
        return mapping

    @staticmethod
    async def _command(socket: aiohttp.ClientWebSocketResponse, msg_id: int, kind: str) -> list[dict[str, Any]]:
        await socket.send_json({"id": msg_id, "type": kind})
        while True:
            message = await socket.receive_json()
            if message.get("id") == msg_id and message.get("type") == "result":
                if not message.get("success", False):
                    raise RuntimeError(f"{kind} failed: {message.get('error')}")
                return message.get("result") or []


registry = Registry()
