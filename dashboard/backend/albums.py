"""Photo albums: the configured sources, and turning them into panel pictures.

A photo widget on the panel names an *album*, never a file. The list of files
changes every time someone adds a picture on their phone, and nothing should
have to be re-pushed for that -- so the two sides agree on a naming scheme
instead and each works out the filenames for itself.

    <album>_<width>x<height>_<crop><border>_<NNN>
    holiday_720x362_fb_004

`Variant.prefix` below builds that string, and `PhotoCard::variantPrefix` in the
firmware builds the same one from the same four facts. **They have to agree
character for character**; if a photo widget draws "ALBUM IS EMPTY" with photos
plainly stored, compare those two functions first.

## Why the size, crop and border are in the name

Because each of them changes the pixels, and the panel cannot rescale anything:
it blits what it is given. The same album on a 3x2 and on a full-screen widget
is two different sets of pictures, "fit" letterboxes where "fill" crops, and a
border costs the picture the four pixels the frame sits in. So a *variant* is
"one album, rendered for one kind of widget", and only the variants some widget
in the layout actually asks for are ever rendered.

## Why the numbering has to be stable

The device downloads by name and skips anything whose hash it already has. If a
refresh renumbered the album -- newest first, say -- then adding one photo would
change the content of every filename and the panel would re-download the lot
over WiFi. So the order is oldest-first by capture date (see icloud.py), which
means a new photo is appended and the existing numbering does not move.
"""

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Callable, Iterable

import aiohttp

import icloud
import images
from settings import DATA_DIR

log = logging.getLogger(__name__)

ALBUMS_PATH = os.path.join(DATA_DIR, "albums.json")

# The grid, mirrored from the firmware's Grid.h. The manifest publishes these
# too, but a refresh runs on a timer and must work when no device has ever
# connected -- so they are duplicated here rather than read from a manifest that
# may not have arrived. Grid.h is the original; keep them in step.
GRID_GAP = 30
GRID_UNIT_W = 220
GRID_UNIT_H = 166      # a page with a chip row
GRID_UNIT_H_OFF = 200  # a page without one
GRID_COLS = 5
GRID_ROWS = 3
PANEL_WIDTH = 1280
PANEL_HEIGHT = 720

# The full-screen photo box, chip row off -- the one grid box PhotoCard's
# fullBleed lets run to the physical edges instead of insetting into it. See
# the comment on photo_size below, and PhotoCard's own for why the filename
# still names this box while the picture itself renders larger.
FULL_SCREEN_BOX = (
    GRID_COLS * GRID_UNIT_W + (GRID_COLS - 1) * GRID_GAP,
    GRID_ROWS * GRID_UNIT_H_OFF + (GRID_ROWS - 1) * GRID_GAP,
)

# How many pictures of an album to keep, unless the album says otherwise.
#
# Deliberately small. Every photo is dithered in pure Python -- error diffusion
# over a quarter of a million pixels, seconds each -- and every photo also costs
# an entry in a manifest that has to fit the device's 16KB MQTT buffer. Twenty
# five at two variants is already a minute of work and a third of the budget.
DEFAULT_LIMIT = 25
MAX_LIMIT = 200

# An album id becomes part of every filename, and images.py allows 32
# characters for the whole thing. The rest of the name -- "_1220x660_fb_000" --
# takes 16, so this is what is left with a character to spare.
MAX_ID_LENGTH = 12


class AlbumError(ValueError):
    """Raised for anything the user can fix in the Images tab."""


# --- what a widget asks for --------------------------------------------------


@dataclass(frozen=True)
class Variant:
    """One album, rendered for one shape of photo widget."""

    album: str
    width: int   # the widget's whole box on the grid
    height: int
    fill: bool   # crop to fill, as against fitting the whole picture in
    border: bool

    @property
    def prefix(self) -> str:
        """The filename stem shared by every picture of this variant.

        Mirrors PhotoCard::variantPrefix in the firmware exactly. Both sides
        derive it; neither is told it.
        """
        crop = "f" if self.fill else "t"
        border = "b" if self.border else "n"
        return f"{self.album}_{self.width}x{self.height}_{crop}{border}_"

    def name(self, index: int) -> str:
        """Contiguous from 000, which is what lets the firmware name a picture
        by arithmetic instead of searching. See PhotoCard.h."""
        return f"{self.prefix}{index:03d}"

    @property
    def photo_size(self) -> tuple[int, int]:
        """The picture's own pixels, which is normally the widget's box less
        the frame.

        With a border the firmware draws a normal card and insets the picture
        into the body, so the picture is CARD_BORDER smaller on every edge.

        The one exception is full screen with no border: PhotoCard runs that
        one case to the physical edges of the panel instead of the usual
        30px-inset grid box, so the picture rendered here has to be the whole
        panel too or the firmware centres an undersized image in a bigger box
        -- the same white margin this exists to get rid of, just moved from
        the grid gap into the picture itself.
        """
        if not self.border and (self.width, self.height) == FULL_SCREEN_BOX:
            return (PANEL_WIDTH, PANEL_HEIGHT)
        if not self.border:
            return (self.width, self.height)
        return (
            self.width - 2 * images.CARD_BORDER,
            self.height - 2 * images.CARD_BORDER,
        )

    @property
    def radius(self) -> int:
        """Rounded to the card body's curve when framed, square when not.

        Square corners are not an oversight: without a frame the picture runs to
        the widget's edge, and rounding it there would leave four white notches
        against the page with nothing to explain them.
        """
        return images.INNER_RADIUS if self.border else 0


def _widget_box(cols: int, rows: int, chip_row: str) -> tuple[int, int]:
    """A widget's pixel footprint, the same arithmetic Grid.h does."""
    unit_h = GRID_UNIT_H_OFF if chip_row == "off" else GRID_UNIT_H
    return (
        cols * GRID_UNIT_W + (cols - 1) * GRID_GAP,
        rows * unit_h + (rows - 1) * GRID_GAP,
    )


def variants_in(layout: dict[str, Any]) -> set[Variant]:
    """Every album-and-shape the layout actually asks for.

    Rendering is expensive enough that doing all four sizes of every album
    speculatively would be minutes of work for pictures nothing shows. So the
    layout decides, and a widget resized in the editor renders its new shape at
    the next refresh.
    """
    wanted: set[Variant] = set()
    for page in layout.get("pages", []):
        chip_row = page.get("chip_row") or "bottom"
        for widget in page.get("widgets", []):
            if widget.get("type") != "photo":
                continue
            options = widget.get("options") or {}
            album = (options.get("album") or "").strip()
            if not album:
                continue

            # "3x2". The firmware's own size id, so there is nothing to agree
            # about -- but a layout can hold anything, so a malformed one is
            # skipped rather than crashing a background refresh.
            size = str(widget.get("size") or "3x2")
            try:
                cols, rows = (int(part) for part in size.split("x", 1))
            except (TypeError, ValueError):
                log.warning("Photo widget has an unreadable size %r, skipping", size)
                continue

            width, height = _widget_box(cols, rows, chip_row)
            wanted.add(
                Variant(
                    album=album,
                    width=width,
                    height=height,
                    # Both default the way PhotoCard's constructor defaults them,
                    # so an option left unset renders what the panel will draw.
                    fill=(options.get("crop") or "fill") != "fit",
                    border=(options.get("border") or "on") != "off",
                )
            )
    return wanted


# --- the configured albums ---------------------------------------------------


def _load() -> dict[str, Any]:
    try:
        with open(ALBUMS_PATH, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return {}
    except (json.JSONDecodeError, OSError) as error:
        log.warning("Could not read the album list (%s), starting empty", error)
        return {}


def _save(albums: dict[str, Any]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(ALBUMS_PATH, "w", encoding="utf-8") as handle:
        json.dump(albums, handle, indent=2, sort_keys=True)


def _make_id(label: str, taken: Iterable[str]) -> str:
    """A short, filename-safe id derived from the album's name."""
    base = "".join(
        character if character.isalnum() else "-" for character in label.strip().lower()
    ).strip("-")
    while "--" in base:
        base = base.replace("--", "-")
    base = base[:MAX_ID_LENGTH].strip("-") or "album"

    existing = set(taken)
    if base not in existing:
        return base
    # "holiday", "holiday2", ... kept inside the length budget.
    for suffix in range(2, 100):
        candidate = f"{base[: MAX_ID_LENGTH - len(str(suffix))]}{suffix}"
        if candidate not in existing:
            return candidate
    raise AlbumError("Too many albums with similar names.")


def listing() -> list[dict[str, Any]]:
    return sorted(_load().values(), key=lambda album: album.get("name", ""))


def get(album_id: str) -> dict[str, Any] | None:
    return _load().get(album_id)


async def add(url: str, name: str = "", limit: int = DEFAULT_LIMIT) -> dict[str, Any]:
    """Register a shared album, after checking iCloud will actually serve it.

    Checked rather than taken on trust: a mistyped link would otherwise sit in
    the list looking configured, and the only symptom would be a widget saying
    ALBUM IS EMPTY with nothing to say why.
    """
    token = icloud.token_from_url(url)

    albums = _load()
    for existing in albums.values():
        if existing.get("token") == token:
            raise AlbumError(f"That album is already added as '{existing['name']}'.")

    found = await icloud.read(token)

    label = name.strip() or found.get("name") or "Album"
    album_id = _make_id(label, albums.keys())
    album = {
        "id": album_id,
        "name": label,
        "token": token,
        "limit": max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT)),
        "added_at": time.time(),
        "available": len(found.get("photos") or []),
        "last_refresh": 0.0,
        "last_error": "",
    }
    albums[album_id] = album
    _save(albums)
    log.info("Added album %s (%s) with %d photos available", label, album_id, album["available"])
    return album


def update(album_id: str, **fields: Any) -> dict[str, Any]:
    albums = _load()
    album = albums.get(album_id)
    if not album:
        raise AlbumError("No such album.")

    if "name" in fields and fields["name"]:
        album["name"] = str(fields["name"]).strip()
    if "limit" in fields and fields["limit"] is not None:
        album["limit"] = max(1, min(int(fields["limit"]), MAX_LIMIT))

    albums[album_id] = album
    _save(albums)
    return album


def remove(album_id: str) -> bool:
    """Forget an album. Its rendered pictures go at the next refresh."""
    albums = _load()
    if album_id not in albums:
        return False
    del albums[album_id]
    _save(albums)
    return True


# --- refreshing --------------------------------------------------------------

# One refresh at a time. Two at once would download the same album twice and
# race each other writing the image index.
_lock = asyncio.Lock()

# The layout of a refresh that was asked for while one was already running.
#
# This used to be dropped -- "a refresh is already running; skipping this one"
# -- which loses the edit that asked for it. A refresh takes minutes, an editing
# session makes several changes a minute, and the change that goes missing is
# the *last* one: resize a widget while its album is rendering and the new shape
# is never rendered at all. It is remembered and run once the current pass ends.
_pending: dict[str, Any] | None = None

# What the Images tab shows while a refresh is running, and afterwards. Held in
# memory only: a refresh that was interrupted by a restart did not finish, and
# reporting it as though it had would be a lie.
_state: dict[str, Any] = {
    "running": False,
    "started_at": 0.0,
    "finished_at": 0.0,
    "rendered": 0,
    "total": 0,
    "album": "",
    "error": "",
}


def status() -> dict[str, Any]:
    return dict(_state)


def starved(layout: dict[str, Any]) -> list[str]:
    """Variants some widget asks for that have no pictures rendered at all.

    A photo widget whose variant is starved draws ALBUM IS EMPTY, and until
    something renders it, it always will. Rendering only happens on a refresh,
    and a refresh only happens on a layout change or on the slow poll -- so
    without this, a widget that ended up empty for any reason stayed empty for
    six hours. The poll uses it to come back sooner.
    """
    held = {entry["name"] for entry in images.listing() if entry.get("album")}
    configured = set(_load())
    return sorted(
        variant.prefix
        for variant in variants_in(layout)
        if variant.album in configured
        and not any(name.startswith(variant.prefix) for name in held)
    )


def _stored_renders() -> dict[str, tuple[str, tuple[int, int]]]:
    """Which album pictures are already rendered, by name, and at what size.

    The source photo's iCloud checksum is what decides whether a rendering is
    still current, and it is kept in the image index rather than in a file of
    its own so that deleting an image cannot leave a stale "already done"
    behind. The size travels with it for a narrower reason: it is not part of
    the *name* (the name is the widget's grid box, unchanged whether or not a
    variant bleeds past it -- see photo_size), so a change to what pixels a
    variant renders at, like PhotoCard's full-screen bleed, would otherwise be
    invisible to this check. The photo's checksum had not changed, so nothing
    told a refresh the existing file was now the wrong size, and it stayed
    that way indefinitely. Comparing the size too is what makes a change here
    self-healing on the next refresh instead of needing every affected album
    re-added by hand.
    """
    return {
        entry["name"]: (entry.get("source", ""), (entry.get("width", 0), entry.get("height", 0)))
        for entry in images.listing()
        if entry.get("album")
    }


async def refresh(
    layout: dict[str, Any], on_change: Callable[[], Any] | None = None
) -> dict[str, Any]:
    """Bring every configured album's pictures up to date with the layout.

    Whole-set rather than incremental on purpose: this is also what removes the
    pictures of a deleted album, or of a widget that changed size or crop, and
    working out those deletions from an event would need the old layout as well
    as the new one.

    The expensive half -- dithering -- runs in a worker thread. In this process
    it is a pure-Python loop over every pixel of every picture, and on the event
    loop it would stall the editor, the MQTT bridge and Home Assistant's own
    polling for minutes at a time.
    """
    global _pending

    if _lock.locked():
        # Kept, not dropped: this layout is newer than the one being worked on.
        _pending = layout
        log.info("A refresh is already running; this one will follow it")
        return status()

    async with _lock:
        current: dict[str, Any] | None = layout
        while current is not None:
            _pending = None
            _state.update(
                running=True, started_at=time.time(), finished_at=0.0,
                rendered=0, total=0, album="", error="",
            )
            try:
                await _refresh(current, on_change)
            except Exception as error:  # noqa: BLE001 - a refresh must never take the add-on down
                log.exception("Album refresh failed")
                _state.update(error=str(error))
            finally:
                _state.update(running=False, finished_at=time.time())

            # Whatever arrived while that was running, which is a later truth
            # than the layout it just worked from.
            current = _pending
            if current is not None:
                log.info("The layout changed while that ran; refreshing again")

        return status()


async def _refresh(
    layout: dict[str, Any], on_change: Callable[[], Any] | None
) -> dict[str, Any]:
    albums = _load()
    wanted = variants_in(layout)

    by_album: dict[str, list[Variant]] = {}
    for variant in wanted:
        by_album.setdefault(variant.album, []).append(variant)

    for album_id in by_album:
        if album_id not in albums:
            log.warning(
                "A photo widget names album '%s', which is not configured", album_id
            )

    log.info(
        "Album refresh: the layout wants %s",
        ", ".join(sorted(variant.prefix for variant in wanted)) or "nothing",
    )

    already = _stored_renders()
    keep: set[str] = set()
    rendered = 0
    changed = False

    # Albums this pass positively read and got photographs for. Only these have
    # their old pictures swept -- see the prune at the bottom for why.
    processed: set[str] = set()

    async with aiohttp.ClientSession(timeout=icloud.TIMEOUT) as session:
        for album_id, variants in by_album.items():
            album = albums.get(album_id)
            if not album:
                continue

            _state.update(album=album["name"])
            try:
                found = await icloud.read(album["token"])
            except icloud.AlbumError as error:
                # One unreachable album must not cost the others their refresh,
                # and must not delete the pictures it already has: the panel
                # keeps showing the album until iCloud answers again.
                log.warning("Album %s: %s", album["name"], error)
                album["last_error"] = str(error)
                keep.update(name for name in already if name.startswith(f"{album_id}_"))
                continue

            available = found.get("photos") or []
            album["available"] = len(available)

            # An album that answers with nothing is not the same as an album
            # that is empty, and from here the two are indistinguishable: a
            # shared album whose asset URLs did not come back this time reads as
            # zero photos with no error at all. Treating that as authoritative
            # swept every rendered picture off the panel, and nothing rendered
            # them again -- so this leaves the album alone instead.
            if not available:
                held = sum(1 for name in already if name.startswith(f"{album_id}_"))
                log.warning(
                    "Album %s came back with no photos. Keeping the %d picture(s) "
                    "already rendered rather than sweeping them: an album that "
                    "failed quietly and one that is genuinely empty look alike.",
                    album["name"], held,
                )
                album["last_error"] = (
                    "iCloud returned no photos. If the album really is empty this "
                    "will clear itself; if not, the link may have stopped working."
                )
                album["last_refresh"] = time.time()
                continue

            photos = available[: album.get("limit", DEFAULT_LIMIT)]
            album["last_error"] = ""
            album["last_refresh"] = time.time()
            # Read, and it had photographs. Now its old renderings can be swept.
            processed.add(album_id)

            _state["total"] = _state.get("total", 0) + len(photos) * len(variants)

            for index, photo in enumerate(photos):
                todo = [
                    variant
                    for variant in variants
                    if already.get(variant.name(index))
                    != (photo["checksum"], variant.photo_size)
                ]
                keep.update(variant.name(index) for variant in variants)
                if not todo:
                    continue

                try:
                    data = await icloud.download(session, photo["url"])
                except (icloud.AlbumError, aiohttp.ClientError, asyncio.TimeoutError) as error:
                    log.warning("Could not download a photo from %s: %s", album["name"], error)
                    continue

                for variant in todo:
                    width, height = variant.photo_size
                    try:
                        # The dither is the slow part, and it is pure Python.
                        # The checksum goes in with it, so the next refresh can
                        # tell this rendering is still of this photo.
                        await asyncio.to_thread(
                            images.store_photo,
                            variant.name(index), data, width, height,
                            variant.fill, variant.radius, "atkinson", album_id,
                            photo["checksum"],
                        )
                    except images.ImageError as error:
                        log.warning("Could not render a photo of %s: %s", album["name"], error)
                        continue

                    rendered += 1
                    changed = True
                    _state["rendered"] = rendered

    # What to sweep. This used to be "anything album-owned not in keep", which
    # treated one refresh as the whole truth -- and any pass that failed to see
    # an album for any reason deleted every picture it had. That is what
    # happened on 2026-09-14: 25 rendered photos went in one pass, the panel
    # drew ALBUM IS EMPTY, and nothing rendered them again because the layout
    # had not changed and so nothing triggered another render.
    #
    # So a picture is only swept when this pass positively knows it is unwanted:
    # either its album is gone from the configuration, which is someone deleting
    # it, or its album was read successfully *and had photographs* and this name
    # was not among them. Anything else -- an album not in the layout this pass,
    # a read that failed, a read that came back empty -- is left alone.
    #
    # The cost is that a genuinely stale rendering can linger until the album is
    # next read properly. That is much the better failure: disc space against a
    # blank widget nobody can get back.
    configured = set(albums)

    def unwanted(entry: dict[str, Any]) -> bool:
        owner = entry.get("album")
        if not owner:
            return False  # an upload, never an album's to sweep
        if owner not in configured:
            return True  # the album was deleted, which is the intent
        if owner not in processed:
            return False  # not read this pass, so nothing is known about it
        return entry["name"] not in keep

    doomed = [entry["name"] for entry in images.listing() if unwanted(entry)]
    if doomed:
        log.info(
            "Dropping %d album picture(s) nothing shows any more: %s",
            len(doomed),
            ", ".join(sorted(doomed)[:6]) + ("…" if len(doomed) > 6 else ""),
        )
    dropped = images.remove_where(lambda entry: not unwanted(entry))
    if dropped:
        changed = True

    _save(albums)

    if changed and on_change:
        await on_change()

    log.info("Album refresh done: %d rendered, %d dropped", rendered, dropped)
    return status()
