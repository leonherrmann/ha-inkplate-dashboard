"""Persistence for the layout being edited.

The layout on disk is the *draft*: it changes on every edit in the browser. Only
a push sends it to the device, and the version is bumped at that point so the
firmware's echo on config/current can be matched against it.
"""

import hashlib
import json
import logging
import os
import uuid
from typing import Any

from settings import DATA_DIR

log = logging.getLogger(__name__)

LAYOUT_PATH = os.path.join(DATA_DIR, "layout.json")

# What was last handed to the device. The draft's own version cannot answer
# this: editing saves over layout.json without touching the version, which only
# a push bumps, so a draft full of unsent edits carries the version that was
# sent. Keeping the fingerprint of what went out is what makes "changes not
# pushed" a fact rather than a guess.
PUSHED_PATH = os.path.join(DATA_DIR, "pushed.json")

# Cell size of the grid positions used before they became pixels
LEGACY_CELL = 80

# The card rows were 200 tall before the chip row took 72 of the panel's height
# and left them 166. Positions are absolute pixels, so a layout written against
# the old grid puts row 1 at y=260 and row 2 at y=490 -- 34 and 68 pixels below
# where those rows now are. Rescaling by row index rather than by a ratio is
# what keeps a widget on the row it was on.
LEGACY_UNIT_H = 200
GRID_GAP = 30
CHIP_ROW_H = 72
DEFAULT_CHIP_ROW = "bottom"

DEFAULT_SLEEP: dict[str, Any] = {
    "enabled": False,
    "start": "23:00",
    "end": "06:00",
    # 0 sleeps straight through; anything else wakes that often to refresh the
    # clock and collect whatever was pushed while asleep
    "wake_minutes": 30,
}

DEFAULT_ROTATION: dict[str, Any] = {
    "enabled": False,
    "default_dwell_seconds": 60,
}

# How much ghosting the panel tolerates before spending a full refresh -- the
# slow black flash -- as a percentage of the screen. A percentage rather than a
# pixel count so the editor never has to know the panel's size; the firmware
# clamps it and does the arithmetic. 12 is the firmware's own default, and the
# two are deliberately the same number so they cannot drift apart.
DEFAULT_REFRESH: dict[str, Any] = {
    "ghost_percent": 12,
}

EMPTY_LAYOUT: dict[str, Any] = {
    "version": 0,
    "sleep": dict(DEFAULT_SLEEP),
    "rotation": dict(DEFAULT_ROTATION),
    "refresh": dict(DEFAULT_REFRESH),
    # Top or bottom. The firmware draws widgets at the pixels it is given and
    # never derives a row, so this is the editor's to know, not the device's.
    "chip_row": DEFAULT_CHIP_ROW,
    "grid_generation": 2,
    "pages": [{"id": "main", "name": "Main", "queued": True, "dwell_seconds": 0, "widgets": []}],
}


def load() -> dict[str, Any]:
    try:
        with open(LAYOUT_PATH, "r", encoding="utf-8") as handle:
            return _migrate(json.load(handle))
    except FileNotFoundError:
        return json.loads(json.dumps(EMPTY_LAYOUT))
    except (json.JSONDecodeError, OSError) as error:
        log.warning("Could not read the stored layout (%s), starting empty", error)
        return json.loads(json.dumps(EMPTY_LAYOUT))


def _migrate(layout: dict[str, Any]) -> dict[str, Any]:
    """Bring an older layout up to date: stable ids, and pixel positions.

    Widgets used to be identified by their array index, which is why deleting one
    disturbed the others, and positioned in 80px grid cells.
    """
    for index, page in enumerate(layout.get("pages", [])):
        # Pages predate having an identity of their own. The id is what rotation
        # and any Home Assistant automation refer to, so backfill it.
        if not page.get("id"):
            page["id"] = f"page{index}"
        page.setdefault("name", str(page["id"]).replace("_", " ").title())
        page.setdefault("queued", True)
        page.setdefault("dwell_seconds", 0)

        for widget in page.get("widgets", []):
            if not widget.get("id"):
                widget["id"] = uuid.uuid4().hex
            if "x" not in widget:
                widget["x"] = int(widget.pop("col", 0)) * LEGACY_CELL
            if "y" not in widget:
                widget["y"] = int(widget.pop("row", 0)) * LEGACY_CELL
            widget.pop("col", None)
            widget.pop("row", None)
    layout.pop("grid", None)
    layout.setdefault("sleep", dict(DEFAULT_SLEEP))
    layout.setdefault("rotation", dict(DEFAULT_ROTATION))
    layout.setdefault("refresh", dict(DEFAULT_REFRESH))
    layout.setdefault("chip_row", DEFAULT_CHIP_ROW)
    _migrate_to_chip_row_grid(layout)
    return layout


# Widgets that belong in the chip row. The manifest is the real authority, but
# it arrives over MQTT and may not have been heard from when a layout is first
# read off disk -- and a migration that silently skipped would leave the layout
# half-converted. This list only has to be right for the types that existed when
# the chip row landed.
_CHIP_TYPES = frozenset({"battery", "wifi"})


def _migrate_to_chip_row_grid(layout: dict[str, Any]) -> None:
    """Move a layout from the 200px card rows to the 166px ones.

    Runs once and records that it has, because it is not idempotent: applying it
    twice would move every widget up another row's worth. Positions are absolute
    pixels, so nothing else would notice the grid had changed under them -- the
    widgets would simply drift further down the panel with each row.
    """
    if layout.get("grid_generation", 0) >= 2:
        return

    old_pitch = LEGACY_UNIT_H + GRID_GAP
    new_pitch = (LEGACY_UNIT_H - 34) + GRID_GAP  # 166 + 30
    chip_y = 720 - GRID_GAP - CHIP_ROW_H

    for page in layout.get("pages", []):
        for widget in page.get("widgets", []):
            if widget.get("type") in _CHIP_TYPES:
                widget["y"] = chip_y
                continue

            # The clock is a sized widget now rather than a fixed special
            if widget.get("type") == "clock":
                widget.setdefault("size", "2x1")

            y = int(widget.get("y", GRID_GAP))
            row = max(0, round((y - GRID_GAP) / old_pitch))
            # Keep whatever offset the widget had within its row, so a
            # deliberately nudged widget is not snapped flat onto the cell.
            offset = y - (GRID_GAP + row * old_pitch)
            widget["y"] = max(0, GRID_GAP + row * new_pitch + offset)

    layout["grid_generation"] = 2


def save(layout: dict[str, Any]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(LAYOUT_PATH, "w", encoding="utf-8") as handle:
        json.dump(layout, handle, indent=2)


def fingerprint(layout: dict[str, Any]) -> str:
    """A digest of the layout's content, ignoring its version.

    Sorted keys, so a round trip through the editor that reorders a dict does
    not read as an edit. The version is left out because a push bumps it in the
    draft as well, which would make every comparison trivially equal and hide
    the case this exists for.
    """
    body = {key: value for key, value in layout.items() if key != "version"}
    return hashlib.sha256(
        json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def record_pushed(layout: dict[str, Any]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    record = {"version": layout.get("version", 0), "digest": fingerprint(layout)}
    with open(PUSHED_PATH, "w", encoding="utf-8") as handle:
        json.dump(record, handle)


def pushed() -> dict[str, Any] | None:
    """The last push, or None if nothing has been sent from this install."""
    try:
        with open(PUSHED_PATH, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return None
    except (json.JSONDecodeError, OSError) as error:
        log.warning("Could not read the pushed-layout record (%s)", error)
        return None


def _looks_like_entity(value: Any) -> bool:
    if not isinstance(value, str) or value.count(".") != 1 or " " in value:
        return False
    domain, _, object_id = value.partition(".")
    return bool(domain and object_id)


def entity_ids(layout: dict[str, Any]) -> set[str]:
    """Every entity the layout refers to, so the bridge knows what to follow.

    Any option whose value looks like an entity id counts; the manifest marks
    them as type "entity", but matching on the domain.object shape keeps this
    independent of whether the manifest happens to be available.

    Lists count too. The device widget stores its resolved entities as an array
    under `entities`, and a device card whose entities were never followed draws
    a full set of dashes -- which looks like a firmware fault and is not one.
    """
    found: set[str] = set()
    for page in layout.get("pages", []):
        for widget in page.get("widgets", []):
            for value in (widget.get("options") or {}).values():
                if isinstance(value, list):
                    found.update(one for one in value if _looks_like_entity(one))
                elif _looks_like_entity(value):
                    found.add(value)
    return found
