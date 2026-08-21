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

EMPTY_LAYOUT: dict[str, Any] = {
    "version": 0,
    "sleep": dict(DEFAULT_SLEEP),
    "rotation": dict(DEFAULT_ROTATION),
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
    return layout


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
