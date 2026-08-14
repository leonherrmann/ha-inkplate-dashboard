"""Publishes daily forecasts for the weather entities a layout references.

Home Assistant removed the `forecast` attribute in 2024.4, so a forecast is only
available by calling weather.get_forecasts and reading the response. That is a
websocket call with return_response, done on a timer rather than on state
change, since a forecast changes far more slowly than a state does.

Each day is trimmed to the three fields WeatherWidget reads, because the widget
parses into a 512-byte document and Home Assistant's own forecast entries are
much larger than that.
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Any, Iterable

import aiohttp

from mqtt import link
from settings import HA_WS_URL, SUPERVISOR_TOKEN

log = logging.getLogger(__name__)

REFRESH_SECONDS = 1800
DAYS = 5


class WeatherBridge:
    def __init__(self) -> None:
        self._entities: set[str] = set()
        self._task: asyncio.Task | None = None
        self._wake = asyncio.Event()

    def follow(self, entity_ids: Iterable[str]) -> None:
        entities = {entity for entity in entity_ids if entity.startswith("weather.")}
        if entities == self._entities:
            return
        self._entities = entities
        log.info("Following %d weather entities", len(entities))
        self._wake.set()

    def start(self) -> None:
        if not SUPERVISOR_TOKEN:
            return
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run(self) -> None:
        while True:
            try:
                if self._entities:
                    await self._publish_all()
            except asyncio.CancelledError:
                raise
            except Exception as error:  # noqa: BLE001 - keep the timer alive
                log.warning("Forecast refresh failed (%s)", error)

            # Wake early when the layout changes, otherwise refresh on the timer
            self._wake.clear()
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=REFRESH_SECONDS)
            except asyncio.TimeoutError:
                pass

    async def _publish_all(self) -> None:
        headers = {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.ws_connect(HA_WS_URL, heartbeat=30) as socket:
                await socket.receive_json()  # auth_required
                await socket.send_json({"type": "auth", "access_token": SUPERVISOR_TOKEN})
                reply = await socket.receive_json()
                if reply.get("type") != "auth_ok":
                    raise RuntimeError(f"Home Assistant rejected the token: {reply}")

                for index, entity_id in enumerate(sorted(self._entities), start=1):
                    forecast = await self._get_forecast(socket, index, entity_id)
                    self._publish(entity_id, forecast)

    @staticmethod
    async def _get_forecast(
        socket: aiohttp.ClientWebSocketResponse, msg_id: int, entity_id: str
    ) -> list[dict[str, Any]]:
        await socket.send_json(
            {
                "id": msg_id,
                "type": "call_service",
                "domain": "weather",
                "service": "get_forecasts",
                "service_data": {"type": "daily"},
                "target": {"entity_id": entity_id},
                "return_response": True,
            }
        )
        while True:
            message = await socket.receive_json()
            if message.get("id") != msg_id or message.get("type") != "result":
                continue
            if not message.get("success", False):
                raise RuntimeError(f"get_forecasts failed: {message.get('error')}")
            response = (message.get("result") or {}).get("response") or {}
            return (response.get(entity_id) or {}).get("forecast") or []

    @staticmethod
    def _publish(entity_id: str, forecast: list[dict[str, Any]]) -> None:
        for index, entry in enumerate(forecast[:DAYS], start=1):
            payload = {
                "day": _weekday(entry.get("datetime")),
                "condition": entry.get("condition", ""),
                "temperature": round(entry.get("temperature") or 0),
            }
            link.publish_state(
                entity_id, json.dumps(payload), attribute=f"forecast/{index}"
            )
        log.info("Published %d forecast days for %s", min(len(forecast), DAYS), entity_id)


def _weekday(timestamp: str | None) -> str:
    """Short upper-case weekday, which is what the widget draws."""
    if not timestamp:
        return ""
    try:
        return datetime.fromisoformat(timestamp).strftime("%a").upper()
    except ValueError:
        return ""


weather = WeatherBridge()
