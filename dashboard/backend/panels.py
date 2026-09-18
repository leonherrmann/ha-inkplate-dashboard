"""Which panels this add-on is managing.

A panel arrives by announcing itself: the firmware derives an id from its MAC
(`inkplate-a864a0`), publishes everything it has to say under
`<root>/devices/<id>/`, and posts its manifest with that id attached. Nothing
here is configured by hand -- the first this add-on hears of a panel is a
retained `status` landing on a wildcard subscription, and that is enough to make
it appear in the device list.

What is kept here is the little that the panel cannot tell us: **the name**,
which is the user's, and **the order** the list is shown in. Everything else --
what it can draw, how it is doing, what it is showing -- is asked of the
manifest, the layout or the live MQTT state at the point it is needed, because
all three change and a copy of them here would be a second answer that could
disagree.

The id is the key for all of it: the layout on disk, the manifest on disk, the
Home Assistant entities, the MQTT topics. It is derived from the MAC precisely
so that it survives a reflash -- a panel that came back with a new id would
arrive as a stranger and leave its dashboard orphaned.

Forgetting a panel deliberately does *not* delete its layout. A panel unplugged
for a fortnight and a panel gone for good look identical from here, and one of
those two mistakes is unrecoverable.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

from settings import DATA_DIR

log = logging.getLogger("inkplate.panels")

PATH = os.path.join(DATA_DIR, "panels.json")

# A name typed into the editor. Long enough for "Kitchen, by the door", short
# enough to sit in a dropdown.
MAX_NAME = 48


def _blank() -> dict[str, Any]:
    return {"panels": {}, "legacy_claimed_by": None}


def _read() -> dict[str, Any]:
    try:
        with open(PATH, encoding="utf-8") as handle:
            stored = json.load(handle)
    except FileNotFoundError:
        return _blank()
    except (json.JSONDecodeError, OSError) as problem:
        log.warning("Could not read the panel list (%s), starting empty", problem)
        return _blank()

    if not isinstance(stored, dict) or not isinstance(stored.get("panels"), dict):
        return _blank()
    stored.setdefault("legacy_claimed_by", None)
    return stored


def _write(state: dict[str, Any]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    # Temp file and replace, like every other write in this add-on: a truncating
    # write here would show a concurrent reader no panels at all, and "no
    # panels" is a state the editor acts on.
    temporary = PATH + ".writing"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(state, handle, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, PATH)


def _default_name(panel_id: str, model: str | None) -> str:
    """What a panel is called before anybody names it.

    The id's three MAC bytes rather than the whole thing: they are what
    distinguishes it, and a dropdown of `inkplate-a864a0` and `inkplate-a86512`
    is a dropdown nobody can read.
    """
    suffix = panel_id[len("inkplate-"):] if panel_id.startswith("inkplate-") else panel_id
    kind = {"inkplate5v1": "Inkplate 5", "inkplate5v2": "Inkplate 5 V2"}.get(
        model or "", "Panel"
    )
    return f"{kind} {suffix}"


def seen(panel_id: str, model: str | None = None) -> dict[str, Any]:
    """Record that this panel exists, and return it.

    Called from anywhere a panel is heard from -- an MQTT message, a manifest
    POST, a screenshot upload. Cheap and idempotent apart from `last_seen`.
    """
    if not panel_id:
        raise ValueError("A panel needs an id")

    state = _read()
    panel = state["panels"].get(panel_id)
    now = time.time()

    if panel is None:
        panel = {
            "id": panel_id,
            "name": _default_name(panel_id, model),
            "model": model,
            "first_seen": now,
        }
        state["panels"][panel_id] = panel
        log.info("A new panel introduced itself: %s (%s)", panel_id, model or "model unknown")
    elif model and panel.get("model") != model:
        # A panel reflashed onto different hardware keeps its id and its layout;
        # the model is what tells the editor its grid changed shape.
        was = panel.get("model")
        panel["model"] = model
        # The default name carries the model, so a panel still wearing one gets
        # the new one. A name somebody typed is left exactly as typed.
        if panel.get("name") == _default_name(panel_id, was):
            panel["name"] = _default_name(panel_id, model)
        log.info("Panel %s is now a %s (was %s)", panel_id, model, was or "unknown")

    panel["last_seen"] = now
    _write(state)
    return dict(panel)


def all() -> list[dict[str, Any]]:
    """Every known panel, oldest first, so the list does not reshuffle itself."""
    state = _read()
    return sorted(state["panels"].values(), key=lambda panel: panel.get("first_seen", 0))


def ids() -> list[str]:
    return [panel["id"] for panel in all()]


def get(panel_id: str) -> dict[str, Any] | None:
    return _read()["panels"].get(panel_id)


def rename(panel_id: str, name: str) -> dict[str, Any]:
    state = _read()
    panel = state["panels"].get(panel_id)
    if panel is None:
        raise KeyError(panel_id)

    cleaned = " ".join(str(name).split())[:MAX_NAME]
    # An empty name is a request to go back to the default rather than to have
    # no name: a blank entry in a dropdown is unclickable.
    panel["name"] = cleaned or _default_name(panel_id, panel.get("model"))
    _write(state)
    return dict(panel)


def forget(panel_id: str) -> bool:
    """Drop a panel from the list. Its layout stays on disk -- see the module docstring."""
    state = _read()
    if panel_id not in state["panels"]:
        return False
    del state["panels"][panel_id]
    _write(state)
    log.info("Forgot panel %s; its layout is still on disk", panel_id)
    return True


def default_id() -> str | None:
    """The panel to show when the editor has not been told which.

    The oldest known, which for an install that had one panel before this add-on
    knew about several is that panel -- so an existing setup opens on the
    dashboard it has always opened on.
    """
    known = ids()
    return known[0] if known else None


def resolve(requested: str | None) -> str | None:
    """Turn the editor's `?panel=` into an id, or None if there are no panels.

    An unknown id resolves to itself rather than to the default. It is either a
    panel that has not been heard from since a restart -- whose layout is still
    on disk and still editable -- or a typo, and quietly editing a *different*
    panel's dashboard is the worse of the two answers.
    """
    if requested:
        return requested
    return default_id()


def claim_legacy(panel_id: str) -> bool:
    """Whether this panel is the one that inherits the pre-multi-device files.

    An install that predates this has a single `layout.json` and `manifest.json`
    with no panel in their names, and they hold a dashboard somebody built. The
    first panel to ask takes them; everything after it starts empty. True only
    on the call that does the claiming, so the caller can do the migration once.
    """
    state = _read()
    if state.get("legacy_claimed_by"):
        return state["legacy_claimed_by"] == panel_id
    state["legacy_claimed_by"] = panel_id
    _write(state)
    log.info("Panel %s inherits the layout from before this add-on knew about several", panel_id)
    return True
