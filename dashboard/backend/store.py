"""Persistence for the layout being edited, one per panel.

The layout on disk is the *draft*: it changes on every edit in the browser. Only
a push sends it to the device, and the version is bumped at that point so the
firmware's echo on config/current can be matched against it.

**Every function here takes the panel it is about.** Each panel has its own
dashboard -- its own pages, its own widgets, its own sleep and rotation settings
-- filed under its id, which is derived from its MAC and survives a reflash. A
panel's grid is its own too, so a layout is not meaningfully portable between
two panels of different shapes; copying pages from one to another is a thing the
editor can offer, not something the files should blur.

An install from before this had a single `layout.json`. The first panel to ask
for its layout inherits it (see panels.claim_legacy), so an existing dashboard
opens as it always has rather than as an empty page.
"""

import hashlib
import json
import logging
import os
import uuid
from typing import Any

import panels
from settings import DATA_DIR

log = logging.getLogger(__name__)

# What a single-panel install left behind, and what the first panel adopts.
LEGACY_LAYOUT_PATH = os.path.join(DATA_DIR, "layout.json")
LEGACY_PUSHED_PATH = os.path.join(DATA_DIR, "pushed.json")


def layout_path(panel_id: str) -> str:
    return os.path.join(DATA_DIR, f"layout-{panel_id}.json")


def pushed_path(panel_id: str) -> str:
    return os.path.join(DATA_DIR, f"pushed-{panel_id}.json")


def _adopt_legacy(panel_id: str) -> None:
    """Move the pre-multi-device files under this panel's name, once.

    Copied rather than renamed: an add-on rolled back to a version that knows
    nothing of panels would find nothing to show, and the file it wants is
    small. It is left where it is and simply stops being read.
    """
    if os.path.exists(layout_path(panel_id)):
        return
    if not os.path.exists(LEGACY_LAYOUT_PATH):
        return
    if not panels.claim_legacy(panel_id):
        return

    for source, destination in (
        (LEGACY_LAYOUT_PATH, layout_path(panel_id)),
        (LEGACY_PUSHED_PATH, pushed_path(panel_id)),
    ):
        try:
            with open(source, encoding="utf-8") as handle:
                body = handle.read()
        except OSError:
            continue
        with open(destination, "w", encoding="utf-8") as handle:
            handle.write(body)
    log.info("Panel %s adopted the layout from before this add-on knew about several", panel_id)

# What was last handed to each device. The draft's own version cannot answer
# this: editing saves over the layout without touching the version, which only
# a push bumps, so a draft full of unsent edits carries the version that was
# sent. Keeping the fingerprint of what went out is what makes "changes not
# pushed" a fact rather than a guess. See pushed_path().

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

# The card rows are 200 tall again on a page that turns its chip row off, which
# is the same arithmetic the pre-chip-row grid used: the row and one gap are the
# whole difference. Kept as its own name because it means something different
# now -- a live setting rather than a grid that no longer exists.
UNIT_H_OFF = 200

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

# Which way up the panel is hung, in degrees: 0 as it comes, 180 turned over.
# Not the same thing as "rotation" above, which is the slideshow through the
# pages -- the two words are unavoidably close, so the key is deliberately not
# spelled "rotation" and the firmware reads them from different places.
#
# Only 0 and 180. Quarter turns would swap the panel's width and height, and
# every widget fixes its box in pixels when it is built, so that is a far bigger
# change than turning the picture over.
DEFAULT_ORIENTATION = 0

EMPTY_LAYOUT: dict[str, Any] = {
    "version": 0,
    "sleep": dict(DEFAULT_SLEEP),
    "rotation": dict(DEFAULT_ROTATION),
    "refresh": dict(DEFAULT_REFRESH),
    "orientation": DEFAULT_ORIENTATION,
    "grid_generation": 3,
    # chip_row is per page: top, bottom or off. The firmware draws widgets at
    # the pixels it is given and never derives a row, but it does read this to
    # know how tall a cell on the page is -- with no row the three card rows
    # divide the whole panel and are 200 instead of 166.
    "pages": [
        {
            "id": "main",
            "name": "Main",
            "queued": True,
            "dwell_seconds": 0,
            "chip_row": DEFAULT_CHIP_ROW,
            "widgets": [],
        }
    ],
}


def load(panel_id: str) -> dict[str, Any]:
    """This panel's draft, or an empty dashboard if it has never been edited."""
    _adopt_legacy(panel_id)
    try:
        with open(layout_path(panel_id), "r", encoding="utf-8") as handle:
            return _migrate(json.load(handle), panel_id)
    except FileNotFoundError:
        return json.loads(json.dumps(EMPTY_LAYOUT))
    except (json.JSONDecodeError, OSError) as error:
        log.warning("Could not read the layout for %s (%s), starting empty", panel_id, error)
        return json.loads(json.dumps(EMPTY_LAYOUT))


def _migrate(layout: dict[str, Any], panel_id: str | None = None) -> dict[str, Any]:
    """Bring an older layout up to date: stable ids, and pixel positions.

    Widgets used to be identified by their array index, which is why deleting one
    disturbed the others, and positioned in 80px grid cells.
    """
    # The chip row used to be one choice for the whole dashboard. It is per page
    # now, because a full-screen clock page wants no row while a dashboard page
    # wants one -- so the old value becomes every page's starting point and the
    # root key goes. Idempotent: once the root key is gone the pages keep their
    # own, and a page added since carries one already.
    inherited = layout.pop("chip_row", None) or DEFAULT_CHIP_ROW

    for index, page in enumerate(layout.get("pages", [])):
        # Pages predate having an identity of their own. The id is what rotation
        # and any Home Assistant automation refer to, so backfill it.
        if not page.get("id"):
            page["id"] = f"page{index}"
        page.setdefault("name", str(page["id"]).replace("_", " ").title())
        page.setdefault("queued", True)
        page.setdefault("dwell_seconds", 0)
        page.setdefault("chip_row", inherited)

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
    layout.setdefault("orientation", DEFAULT_ORIENTATION)
    _migrate_to_chip_row_grid(layout)
    _migrate_to_shared_cell(layout, panel_id)
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


# Every chip type, for recognising the chip row of a layout on the old grid.
# The same list the manifest marks with "chip"; it is written out rather than
# read from one because a layout is migrated when it is read off disk, which can
# be before any panel has said what it draws.
_ALL_CHIP_TYPES = frozenset({"battery", "wifi", "mqtt", "update", "entity_chip"})

# What the editor reserved for each chip on the old grid: the manifest's figures
# then, which were one set for every panel. A chip is placed by its left edge,
# so a row pushed against the right margin can only be told apart by these.
_OLD_CHIP_WIDTHS = {"battery": 175, "wifi": 80, "mqtt": 80, "update": 210, "entity_chip": 220}

# The grid every layout was placed on before the panels shared one cell: 220x166
# cells with one 30px gap that was also the margin, and a 72px chip row. A
# layout that was never pushed with `laid_out_for` is one the firmware still
# reads on this grid, and re-fits.
_OLD = {"margin": 30, "unit_w": 220, "unit_h": 166, "unit_h_off": 200, "chip_h": 72}


def _card_span(widget: dict[str, Any]) -> tuple[int, int] | None:
    """Columns and rows of a card sized like "2x1", or None for anything else."""
    size = str(widget.get("size") or "")
    cols, _, rows = size.partition("x")
    if cols.isdigit() and rows.isdigit():
        return int(cols), int(rows)
    return None


def _old_band_top(chip_row: str) -> int:
    old = _OLD
    return old["margin"] + old["chip_h"] + old["margin"] if chip_row == "top" else old["margin"]


def _old_pitch_y(chip_row: str) -> int:
    old = _OLD
    return (old["unit_h_off"] if chip_row == "off" else old["unit_h"]) + old["margin"]


def _on_old_grid(layout: dict[str, Any]) -> bool:
    """Whether a layout's upright widgets sit on the old grid rather than a new one.

    Decided by where they are, because nothing in a layout of generation 2 says:
    that generation spans the 220px grid and the first months of the shared cell.
    Cards are the evidence -- each is exactly on a cell of one grid or the other,
    and 30 + 250k is on no shape's grid now. A layout with chips and no cards
    falls back to the chip row, which was at 618 or 30 and is at neither now.
    """
    cards = 0
    chips = 0
    for page in layout.get("pages", []):
        chip_row = page.get("chip_row") or DEFAULT_CHIP_ROW
        for widget in page.get("widgets", []):
            x, y = widget.get("x"), widget.get("y")
            if not isinstance(x, int) or not isinstance(y, int):
                continue
            if widget.get("type") in _ALL_CHIP_TYPES:
                row_y = 30 if chip_row == "top" else 720 - 30 - 72
                if y != row_y:
                    return False
                chips += 1
                continue
            if _card_span(widget) is None:
                continue
            pitch_x = _OLD["unit_w"] + _OLD["margin"]
            if (x - _OLD["margin"]) % pitch_x or (y - _old_band_top(chip_row)) % _old_pitch_y(chip_row):
                return False
            cards += 1
    return cards > 0 or chips > 0


def _pack_chips(chips: list[dict[str, Any]], width_of, margin: int, gap: int, panel_width: int) -> None:
    """Space one row of chips as the editor would: in their order, a gap apart,
    inside the margins. The editor's settleChips, so a migrated row is one the
    editor has nothing to say about."""
    row = sorted(chips, key=lambda widget: widget["x"])
    widths = [width_of(widget.get("type")) for widget in row]
    limit = [max(margin, panel_width - margin - width) for width in widths]
    xs = [min(max(widget["x"], margin), limit[i]) for i, widget in enumerate(row)]
    for i in range(1, len(xs)):
        xs[i] = max(xs[i], xs[i - 1] + widths[i - 1] + gap)
    for i in range(len(xs) - 1, -1, -1):
        xs[i] = min(xs[i], limit[i])
        if i < len(xs) - 1:
            xs[i] = min(xs[i], xs[i + 1] - gap - widths[i])
        xs[i] = max(xs[i], margin)
    for widget, x in zip(row, xs):
        widget["x"] = x


def _migrate_to_shared_cell(layout: dict[str, Any], panel_id: str | None) -> None:
    """Move a layout off the 220x166 grid onto the panel's own.

    Every shape now shares one 210x172 cell, with its own gaps and margins. A
    layout placed before that was never moved: the panel was unaffected, because
    a layout pushed without `laid_out_for` is re-fitted on arrival -- but the
    editor drew it as it stood, every card a few pixels off its cell and every
    chip 17px above the row, and the next push would have stamped it as drawn on
    the new grid, at which point the panel would have stopped re-fitting it and
    drawn it that way too.

    The same mapping the firmware's LayoutFit makes: a card keeps its cell, a
    chip keeps its place across the band between the margins and goes onto the
    row, and anything else scales by the pitch. A card whose cell this panel
    does not have is left where it maps to, for the editor's rescue to deal with,
    rather than dropped from somebody's layout by a migration.

    Only the upright arrangement: sideways ones did not exist on the old grid.
    """
    if layout.get("grid_generation", 0) >= 3:
        return
    if not _on_old_grid(layout):
        layout["grid_generation"] = 3
        return

    # Here rather than at the top: only this reads a panel's manifest
    import grids
    import manifest_store

    shapes = grids.shapes_of(panel_id)
    new = shapes.get("landscape") or grids.of(panel_id)
    old = _OLD
    old_pitch_x = old["unit_w"] + old["margin"]
    new_pitch_x = new.unit_w + new.gap_x
    new_pitch_y = new.unit_h + new.gap_y
    old_band = 1280 - 2 * old["margin"]
    new_band = new.width - 2 * new.margin_x

    def band_top(chip_row: str) -> int:
        if chip_row == "off":
            band = new.rows * new.unit_h + (new.rows - 1) * new.gap_y
            return max(new.margin_y, round((new.height - band) / 2))
        if chip_row == "top":
            return new.margin_y + new.chip_h + new.gap_y
        return new.margin_y

    def chip_top(chip_row: str) -> int:
        return new.margin_y if chip_row == "top" else new.height - new.margin_y - new.chip_h

    # What this panel reserves for each chip now, which is what it draws them at
    manifest = manifest_store.load(panel_id) if panel_id else None
    new_widths = {
        entry.get("type"): int(entry.get("width") or 0)
        for entry in (manifest or {}).get("widgets") or []
        if entry.get("chip")
    }

    def chip_width(kind: str) -> int:
        return new_widths.get(kind) or _OLD_CHIP_WIDTHS.get(kind, 160)

    def scale(value: int) -> int:
        return new.margin_x + round((value - old["margin"]) * new_band / old_band)

    for page in layout.get("pages", []):
        chip_row = page.get("chip_row") or DEFAULT_CHIP_ROW
        chips = []
        for widget in page.get("widgets", []):
            x = int(widget.get("x", old["margin"]))
            y = int(widget.get("y", old["margin"]))
            if widget.get("type") in _ALL_CHIP_TYPES:
                # By the edge the panel anchors it on: the left for a chip in the
                # left half, the right for one in the right, which is what keeps
                # a row pushed against either margin against it.
                kind = widget.get("type")
                was = _OLD_CHIP_WIDTHS.get(kind, 160)
                if x + was / 2 < 1280 / 2:
                    widget["x"] = scale(x)
                else:
                    widget["x"] = scale(x + was) - chip_width(kind)
                widget["y"] = chip_top(chip_row)
                chips.append(widget)
                continue
            col = max(0, round((x - old["margin"]) / old_pitch_x))
            row = max(0, round((y - _old_band_top(chip_row)) / _old_pitch_y(chip_row)))
            if _card_span(widget) is not None:
                widget["x"] = new.margin_x + col * new_pitch_x
                widget["y"] = band_top(chip_row) + row * new_pitch_y
                continue
            # Placed freely, so kept at the same fraction of the way across a cell
            widget["x"] = new.margin_x + round((x - old["margin"]) * new_pitch_x / old_pitch_x)
            widget["y"] = band_top(chip_row) + round(
                (y - _old_band_top(chip_row)) * new_pitch_y / _old_pitch_y(chip_row)
            )

        _pack_chips(chips, chip_width, new.margin_x, new.gap_x, new.width)

    log.info("Moved the layout for %s onto its panel's grid of %dx%d cells",
             panel_id, new.unit_w, new.unit_h)
    layout["grid_generation"] = 3


def save(panel_id: str, layout: dict[str, Any]) -> None:
    """Write the draft, whole, so a concurrent reader never sees half of it.

    Opening the real path with "w" truncates it before a byte is written, and
    anything calling load() in that window gets a JSONDecodeError -- which load()
    answers with an *empty layout*. On 2026-09-14 that wiped a photo album off a
    panel: the album refresh runs as a background task, loaded the layout while
    an edit was being saved, saw no widgets at all, and concluded nothing wanted
    the 25 pictures it then deleted.

    The same race could have handed any other reader an empty dashboard, so this
    is fixed here rather than defended against at each call site.
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    path = layout_path(panel_id)
    temporary = f"{path}.writing"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(layout, handle, indent=2)
        # Flushed and synced before the rename: os.replace is atomic for the
        # *name*, which is no help if the bytes are still in a buffer when the
        # add-on is stopped.
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


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


def record_pushed(panel_id: str, layout: dict[str, Any]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    record = {"version": layout.get("version", 0), "digest": fingerprint(layout)}
    with open(pushed_path(panel_id), "w", encoding="utf-8") as handle:
        json.dump(record, handle)


def pushed(panel_id: str) -> dict[str, Any] | None:
    """The last push to this panel, or None if nothing has been sent to it."""
    try:
        with open(pushed_path(panel_id), "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return None
    except (json.JSONDecodeError, OSError) as error:
        log.warning("Could not read the pushed-layout record for %s (%s)", panel_id, error)
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

    Both arrangements, upright and sideways: a widget placed only in a page's
    sideways arrangement is still one a panel draws, and reading `widgets`
    alone left its entities unfollowed.
    """
    found: set[str] = set()
    for page in layout.get("pages", []):
        widgets = (page.get("widgets") or []) + (page.get("widgets_portrait") or [])
        for widget in widgets:
            for value in (widget.get("options") or {}).values():
                if isinstance(value, list):
                    found.update(one for one in value if _looks_like_entity(one))
                elif _looks_like_entity(value):
                    found.add(value)
    return found


def every_entity_id() -> set[str]:
    """Every entity any panel's layout names.

    What the Home Assistant bridge follows, and what the add-on republishes on
    the shared state topics. The union rather than one panel's, because the
    states are shared: following only the panel being edited would stop the
    readings on every other panel the moment you opened this one.
    """
    found: set[str] = set()
    for panel in panels.all():
        found |= entity_ids(load(panel["id"]))
    return found
