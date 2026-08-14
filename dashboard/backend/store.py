"""Persistence for the layout being edited.

The layout on disk is the *draft*: it changes on every edit in the browser. Only
a push sends it to the device, and the version is bumped at that point so the
firmware's echo on config/current can be matched against it.
"""

import json
import logging
import os
import uuid
from typing import Any

from settings import DATA_DIR

log = logging.getLogger(__name__)

LAYOUT_PATH = os.path.join(DATA_DIR, "layout.json")

# Cell size of the grid positions used before they became pixels
LEGACY_CELL = 80

DEFAULT_SLEEP: dict[str, Any] = {
    "enabled": False,
    "start": "23:00",
    "end": "06:00",
    # 0 sleeps straight through; anything else wakes that often to refresh the
    # clock and collect whatever was pushed while asleep
    "wake_minutes": 30,
}

EMPTY_LAYOUT: dict[str, Any] = {
    "version": 0,
    "sleep": dict(DEFAULT_SLEEP),
    "pages": [{"id": "main", "widgets": []}],
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
    for page in layout.get("pages", []):
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
    return layout


def save(layout: dict[str, Any]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(LAYOUT_PATH, "w", encoding="utf-8") as handle:
        json.dump(layout, handle, indent=2)


def entity_ids(layout: dict[str, Any]) -> set[str]:
    """Every entity the layout refers to, so the bridge knows what to follow.

    Any option whose value looks like an entity id counts; the manifest marks
    them as type "entity", but matching on the domain.object shape keeps this
    independent of whether the manifest happens to be available.
    """
    found: set[str] = set()
    for page in layout.get("pages", []):
        for widget in page.get("widgets", []):
            for value in (widget.get("options") or {}).values():
                if isinstance(value, str) and value.count(".") == 1 and " " not in value:
                    domain, _, object_id = value.partition(".")
                    if domain and object_id:
                        found.add(value)
    return found
