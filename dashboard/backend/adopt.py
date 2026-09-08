"""Taking over a setting somebody changed on the panel itself.

The panel has three buttons and a settings menu, and four of the things it can
change from there -- orientation, screen refresh, night sleep, and which pages
rotate -- live in the layout this add-on publishes. That layout is *retained*,
so the broker hands it back to the device on every reconnect; without something
here, a setting changed by hand would be undone seconds later and the button
would look broken rather than overruled.

The firmware's half is an override in NVS that beats the layout. This is the
other half, and the reason the override is temporary rather than a permanent
fork: the device publishes what it overrode on `<root>/settings`, retained, this
writes those values into the stored layout and pushes it, and the firmware drops
the override the moment a layout arrives already carrying the value. Ownership
comes back here as soon as this agrees, and until then the editor shows what the
panel is really doing rather than what it was last told.

It terminates: adopting produces a layout the device agrees with, the device
clears its override and publishes an empty object, and an empty object adopts
nothing. Nothing here pushes unless something actually changed, which is what
keeps a retained replay on every reconnect from being a push on every reconnect.
"""

import logging
from typing import Any

import store

log = logging.getLogger(__name__)


def merge(layout: dict[str, Any], overrides: dict[str, Any]) -> list[str]:
    """Write the panel's values into `layout`. Returns what actually changed.

    An empty list means the layout already said this, which is the normal case
    on a reconnect and must not cost a push.
    """
    changed: list[str] = []

    if not isinstance(overrides, dict):
        return changed

    orientation = overrides.get("orientation")
    # Only the two the firmware can be in. Anything else is a payload from a
    # newer firmware than this add-on, and guessing at it would push a layout
    # the device then disagrees with -- which is the one state that does not
    # settle on its own.
    if orientation in (0, 180) and layout.get("orientation") != orientation:
        layout["orientation"] = orientation
        changed.append(f"orientation {orientation}")

    ghost = overrides.get("ghost_percent")
    if isinstance(ghost, int) and 1 <= ghost <= 100:
        refresh = layout.setdefault("refresh", dict(store.DEFAULT_REFRESH))
        if refresh.get("ghost_percent") != ghost:
            refresh["ghost_percent"] = ghost
            changed.append(f"screen refresh {ghost}%")

    tick = overrides.get("timer_tick_seconds")
    # Only the two the panel's own settings screen offers. A value from a newer
    # firmware would be adopted into a layout this add-on cannot then show, and
    # the editor would silently disagree with the device about it.
    if tick in (1, 5) and layout.get("timer_tick_seconds") != tick:
        layout["timer_tick_seconds"] = tick
        changed.append(f"timer update every {tick}s")

    sleeping = overrides.get("sleep_enabled")
    if isinstance(sleeping, bool):
        sleep = layout.setdefault("sleep", dict(store.DEFAULT_SLEEP))
        if bool(sleep.get("enabled")) != sleeping:
            sleep["enabled"] = sleeping
            changed.append("night sleep " + ("on" if sleeping else "off"))

    pages = overrides.get("pages")
    if isinstance(pages, dict):
        by_id = {str(page.get("id")): page for page in layout.get("pages", [])}
        for page_id, queued in pages.items():
            if not isinstance(queued, bool):
                continue
            page = by_id.get(str(page_id))
            # A page the panel knows about and this layout does not. That
            # happens while a push is in flight, and it is not an error: the
            # device drops the override for a page it can no longer see.
            if page is None:
                continue
            if bool(page.get("queued", True)) != queued:
                page["queued"] = queued
                name = page.get("name") or page_id
                changed.append(f"page {name} " + ("on" if queued else "off"))

    return changed


def adopt(overrides: dict[str, Any]) -> dict[str, Any] | None:
    """Merge and save. Returns the layout to push, or None if nothing changed.

    Deliberately does not push: the caller owns the connection, and the version
    bump belongs with the push rather than with the save, exactly as it does for
    an edit made in the editor.
    """
    if not overrides:
        return None

    layout = store.load()
    changed = merge(layout, overrides)
    if not changed:
        return None

    log.info("Adopting settings changed on the panel: %s", ", ".join(changed))
    store.save(layout)
    return layout
