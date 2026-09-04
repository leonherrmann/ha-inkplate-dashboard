"""Home Assistant's area, device and entity registries, joined and cached.

Two things need them. The entity picker groups by area, and an area lives in the
area registry rather than on the state object -- an entity reaches one either
directly or through its device. The device picker needs the devices themselves,
along with the entities hanging off each.

Registry reads are websocket-only, so this opens its own short-lived connection
rather than sharing the state bridge's long-running one, and caches the result.
"""

import logging
import time
from typing import Any

import aiohttp

from settings import HA_WS_URL, SUPERVISOR_TOKEN

log = logging.getLogger(__name__)

CACHE_SECONDS = 300

# What to put at the top of a device's entity list. The card draws rows until it
# runs out of height, so this ordering decides what falls off the bottom.
#
# The principle: what the device is *for* comes before what it reports about
# itself. A door sensor's door outranks its battery; a thermostat's climate
# entity outranks its signal strength.
DOMAIN_RANK = [
    "climate",
    "water_heater",
    "humidifier",
    "light",
    "cover",
    "valve",
    "lock",
    "media_player",
    "vacuum",
    "fan",
    "alarm_control_panel",
    "binary_sensor",
    "sensor",
    "switch",
    "number",
    "select",
    "update",
    "button",
]

# entity_category, in the order Home Assistant defines it. `config` entities are
# settings rather than readings -- a motion sensitivity, an LED toggle -- and a
# display-only panel has nothing to do with them, so they are left out entirely
# rather than ranked last.
CATEGORY_RANK = {None: 0, "diagnostic": 1}

# Domains a device card should never offer. Every one of these has a state that
# is either an instruction or a timestamp of when something last happened, and
# neither is a reading worth a tile on a panel you glance at.
#
# `button` is the one that prompted this: almost every Zigbee and Matter device
# carries an Identify button, and a few carry Restart or Ping. Their state is
# the moment they were last pressed, so a tile for one would show a time that
# means nothing and never changes.
UNSHOWABLE_DOMAINS = {
    "button",
    "event",
    "scene",
    "script",
    "automation",
    "siren",
    "remote",
    "camera",
    "image",
    "text",
    "todo",
    "notify",
    "conversation",
    "stt",
    "tts",
    "assist_satellite",
}


class Registry:
    def __init__(self) -> None:
        self._snapshot: dict[str, Any] | None = None
        self._fetched_at: float = 0.0
        self.time_zone: str | None = None

    async def entities(self, states: list[dict[str, Any]]) -> list[dict[str, str]]:
        """Entities from `states`, annotated with domain and area name."""
        snapshot = await self._load()
        areas_by_entity = snapshot["areas_by_entity"]

        return [
            {
                "entity_id": state["entity_id"],
                "name": (state.get("attributes") or {}).get("friendly_name", state["entity_id"]),
                "domain": state["entity_id"].split(".", 1)[0],
                "area": areas_by_entity.get(state["entity_id"], ""),
            }
            for state in states
        ]

    async def devices(self, states: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Devices, each with its entities already ranked for a card.

        Ranked here rather than in the editor because the ordering is a Home
        Assistant fact -- what entity_category an entity carries, what domain it
        is -- and the editor should not have to learn the registry's vocabulary
        to sort a list.
        """
        snapshot = await self._load()
        if not snapshot["devices"]:
            return []

        by_device: dict[str, list[dict[str, Any]]] = {}
        for entry in await self._showable(snapshot, states):
            device_id = entry.pop("device_id")
            entry.pop("area_id", None)
            if not device_id:
                continue
            by_device.setdefault(device_id, []).append(entry)

        out: list[dict[str, Any]] = []
        for device in snapshot["devices"]:
            device_id = device.get("id")
            listed = sorted(by_device.get(device_id, []), key=lambda one: one["_rank"])
            if not listed:
                # A device with nothing to show is not worth offering. Most of
                # these are hubs and bridges whose entities all belong to the
                # things behind them.
                continue
            for one in listed:
                one.pop("_rank", None)

            area_id = device.get("area_id")
            out.append(
                {
                    "id": device_id,
                    # name_by_user is what the user renamed it to, and wins
                    "name": device.get("name_by_user") or device.get("name") or device_id,
                    "area": snapshot["area_names"].get(area_id, "") if area_id else "",
                    "manufacturer": device.get("manufacturer") or "",
                    "model": device.get("model") or "",
                    "entities": listed,
                }
            )

        out.sort(key=lambda one: one["name"].lower())
        return out

    async def areas(self, states: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Areas, each with their showable entities ranked the same way a
        device's are.

        Backs the room widget's auto-population: picking an area in the editor
        resolves it to entity ids here, the same arrangement as the device
        card and for the same reason -- the panel has no credentials to ask
        Home Assistant what an area is, so the add-on resolves it once and
        writes plain entity ids into the layout.
        """
        snapshot = await self._load()
        if not snapshot["area_names"]:
            return []

        by_area: dict[str, list[dict[str, Any]]] = {}
        for entry in await self._showable(snapshot, states):
            area_id = entry.pop("area_id")
            entry.pop("device_id", None)
            if not area_id:
                continue
            by_area.setdefault(area_id, []).append(entry)

        out: list[dict[str, Any]] = []
        for area_id, name in snapshot["area_names"].items():
            listed = sorted(by_area.get(area_id, []), key=lambda one: one["_rank"])
            if not listed:
                # An area with nothing live in it is not worth offering --
                # mirrors the device list dropping hubs with no entities.
                continue
            for one in listed:
                one.pop("_rank", None)
            out.append({"id": area_id, "name": name, "entities": listed})

        out.sort(key=lambda one: one["name"].lower())
        return out

    # -- internals ---------------------------------------------------------

    async def _showable(
        self, snapshot: dict[str, Any], states: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Entity registry entries a device or room card is allowed to draw,
        ranked and carrying both their device and area id so each caller can
        group by whichever it needs.
        """
        names = {
            state["entity_id"]: (state.get("attributes") or {}).get("friendly_name")
            or state["entity_id"]
            for state in states
        }
        # What kind of reading each one is, straight from Home Assistant. The
        # room card's band needs this: a temperature, a humidity, a PM2.5 and a
        # CO2 each have an option of their own now, and the editor fills them in
        # when a room is picked. The registry entry does not carry it -- it is a
        # state attribute -- so it is picked up here alongside the name.
        classes = {
            state["entity_id"]: (state.get("attributes") or {}).get("device_class") or ""
            for state in states
        }
        # Only entities Home Assistant currently has a state for. A registry
        # entry with no state is one that is not loaded, and a row for it would
        # never say anything.
        live = set(names)

        out: list[dict[str, Any]] = []
        for entry in snapshot["entries"]:
            entity_id = entry.get("entity_id")
            if not entity_id or entity_id not in live:
                continue
            # Disabled entities have no state at all; hidden ones do, and the
            # user has said they do not want to see them.
            if entry.get("disabled_by") or entry.get("hidden_by"):
                continue

            category = entry.get("entity_category")
            if category not in CATEGORY_RANK:
                continue

            domain = entity_id.split(".", 1)[0]
            if domain in UNSHOWABLE_DOMAINS:
                continue

            # An entity's own area wins; otherwise it inherits its device's.
            area_id = entry.get("area_id") or snapshot["device_areas"].get(
                entry.get("device_id")
            )
            out.append(
                {
                    "entity_id": entity_id,
                    "device_id": entry.get("device_id"),
                    "area_id": area_id,
                    "name": names[entity_id],
                    "domain": domain,
                    "device_class": classes.get(entity_id, ""),
                    "category": category or "",
                    "_rank": (
                        CATEGORY_RANK[category],
                        DOMAIN_RANK.index(domain) if domain in DOMAIN_RANK else len(DOMAIN_RANK),
                        names[entity_id],
                    ),
                }
            )
        return out

    async def _load(self) -> dict[str, Any]:
        if self._snapshot and (time.time() - self._fetched_at) < CACHE_SECONDS:
            return self._snapshot

        if not SUPERVISOR_TOKEN:
            return _empty()

        try:
            self._snapshot = await self._fetch()
            self._fetched_at = time.time()
        except Exception as error:  # noqa: BLE001 - the pickers still work unarea'd
            log.warning("Could not read the registries (%s); areas will be blank", error)
            return self._snapshot or _empty()

        return self._snapshot

    async def _fetch(self) -> dict[str, Any]:
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
                entries = await self._command(socket, 3, "config/entity_registry/list")

                # Picked up here rather than in its own connection, since the
                # device needs Home Assistant's timezone to show the right time
                config = await self._command(socket, 4, "get_config")
                if isinstance(config, dict):
                    self.time_zone = config.get("time_zone")

        area_names = {area["area_id"]: area["name"] for area in areas or []}
        device_areas = {device["id"]: device.get("area_id") for device in devices or []}

        areas_by_entity: dict[str, str] = {}
        for entry in entries or []:
            # An entity's own area_id wins; otherwise it inherits its device's
            area_id = entry.get("area_id") or device_areas.get(entry.get("device_id"))
            if area_id:
                areas_by_entity[entry["entity_id"]] = area_names.get(area_id, "")

        log.info(
            "Registry: %d areas, %d devices, areas resolved for %d entities",
            len(area_names),
            len(devices or []),
            len(areas_by_entity),
        )
        return {
            "area_names": area_names,
            "areas_by_entity": areas_by_entity,
            "device_areas": device_areas,
            "devices": devices or [],
            "entries": entries or [],
        }

    @staticmethod
    async def _command(socket: aiohttp.ClientWebSocketResponse, msg_id: int, kind: str) -> Any:
        """Result of a websocket command; a list for the registries, a dict for get_config."""
        await socket.send_json({"id": msg_id, "type": kind})
        while True:
            message = await socket.receive_json()
            if message.get("id") == msg_id and message.get("type") == "result":
                if not message.get("success", False):
                    raise RuntimeError(f"{kind} failed: {message.get('error')}")
                return message.get("result")


def _empty() -> dict[str, Any]:
    return {
        "area_names": {},
        "areas_by_entity": {},
        "device_areas": {},
        "devices": [],
        "entries": [],
    }


registry = Registry()
