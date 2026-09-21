"""What the panel sends back about itself: its log, and a picture of its screen.

Both arrive by plain HTTP on the device port, for the same reason image blobs go
out that way -- the editor is behind Home Assistant's authenticated ingress and
the device cannot log in to it.

The two halves of the add-on run as separate uvicorn processes, so this module is
the only thing they share: the device process writes here, the editor process
reads. That is deliberate and already how images and firmware work; a file is a
simpler contract between two processes than a socket.
"""

import json
import logging
import os
import time
from typing import Any

from PIL import Image

import grids
from settings import DATA_DIR

log = logging.getLogger(__name__)

# One set per panel. A screenshot and a boot log belong to the panel that sent
# them, and a shared file meant two panels overwriting each other's evidence --
# which is at its worst exactly when two panels are misbehaving together.
def screenshot_path(panel_id: str) -> str:
    return os.path.join(DATA_DIR, f"screenshot-{panel_id}.png")


def screenshot_meta_path(panel_id: str) -> str:
    return os.path.join(DATA_DIR, f"screenshot-{panel_id}.json")


def log_path(panel_id: str) -> str:
    return os.path.join(DATA_DIR, f"device-log-{panel_id}.txt")

# A screenshot is the framebuffer verbatim, so its length is fixed by the panel
# it came from -- and **the panels are not the same size**: 1280x720 is 115,200
# bytes and 960x540 is 64,800. This was one pair of constants, which meant the
# smaller panel's screenshot was refused as a truncated upload every time:
# "Expected 115200 bytes, got 64800". The size comes from the sending panel's
# own grid now; see grids.py, which reads it from the manifest that panel
# published.
def frame_size(panel_id: str) -> tuple[int, int]:
    """The panel as it is standing: what its *picture* is, once turned."""
    grid = grids.of(panel_id)
    return grid.width, grid.height


def native_frame_size(panel_id: str) -> tuple[int, int]:
    """The glass's own shape, which is what a framebuffer always is.

    A panel stood on its side draws into the same buffer it always had -- the
    library maps the drawing coordinates on the way in -- so an upload is
    960x540 whichever way up an Inkplate 5 is. Reading it as 540x960 gets two
    things wrong at once: the row stride, which garbles the picture, and the
    byte count, which is not even the same number. 540 is not a multiple of 8,
    so `540 // 8 * 960` is 64,320 against the 64,800 that actually arrives, and
    the upload was refused with a 400 rather than merely looking wrong.

    The V2 is worse rather than better: 720 and 1280 are both multiples of 8, so
    the count matches by luck and the picture comes out scrambled with no error
    at all.
    """
    shapes = grids.shapes_of(panel_id)
    landscape = shapes.get("landscape")
    if landscape:
        return landscape.width, landscape.height

    # Firmware too old to publish both shapes cannot be turned, so the shape it
    # reports is the glass's. The swap is for the case that cannot arise today
    # and would be silent if it ever did.
    grid = grids.of(panel_id)
    return (grid.height, grid.width) if grid.height > grid.width else (grid.width, grid.height)


def frame_bytes(panel_id: str) -> int:
    width, height = native_frame_size(panel_id)
    return width // 8 * height

# The device's framebuffer is 1 bit per pixel, **LSB first within each byte**,
# and a **set bit is ink** -- both the opposite of what PIL's plain "1" rawmode
# assumes, which is MSB first with a set bit meaning white. "1;IR" is inverted
# and bit-reversed, which is exactly the pair of corrections needed.
#
# This is worth stating because the wrong answer looks nearly right: the number
# of black pixels is identical whichever bit order you pick, since reversing a
# byte does not change how many bits are set. Only comparing pixel for pixel
# against a known frame tells them apart, and the mistake shows up as detail
# scrambled within every eight-pixel block.
FRAME_RAWMODE = "1;IR"

# Enough log to cover a boot and what followed it, several times over, without
# letting a device in a reboot loop fill the data partition.
LOG_LIMIT_BYTES = 256 * 1024


# Undoing the panel's rotation. The device stores its framebuffer in the panel's
# own orientation, not the one it draws in: Graphics::writePixel applies the
# rotation on the way in, so with the sketch's setRotation(2) the buffer is 180
# degrees from what a person in front of it sees.
#
# Derived from that transform rather than guessed, since only rotation 2 can be
# tried here -- it is the only one the firmware has ever set. For rotation 1 the
# device maps drawn (x, y) to native (H-1-y, x), which is recovered by turning
# the stored image a quarter turn anticlockwise; rotation 3 is the mirror of
# that. **1 and 3 are unexercised**: no build has used them, so they are a
# careful reading of the library rather than something observed.
UNROTATE = {
    0: None,
    1: Image.Transpose.ROTATE_90,  # anticlockwise
    2: Image.Transpose.ROTATE_180,
    3: Image.Transpose.ROTATE_270,
}

# What to assume when the device does not say. Firmware v2026.9.10 uploaded
# without this parameter and drew at rotation 2, as every build of this firmware
# has, so taking 2 as the default gets the picture the right way up for the one
# release that cannot tell us. From v2026.9.11 the device says so explicitly and
# this is not consulted.
DEFAULT_ROTATION = 2


def save_screenshot(panel_id: str, raw: bytes, rotation: int = DEFAULT_ROTATION) -> dict[str, Any]:
    """Store the framebuffer as a PNG. Raises ValueError if it is not one."""
    # Native, not the shape it is standing in: see native_frame_size.
    width, height = native_frame_size(panel_id)
    expected = width // 8 * height
    if len(raw) != expected:
        # Named, because the two panels' sizes are both plausible numbers and
        # the useful question is which panel this was supposed to be from.
        raise ValueError(
            f"Expected {expected} bytes of framebuffer for {panel_id} "
            f"({width}x{height}), got {len(raw)}"
        )

    image = Image.frombytes("1", (width, height), raw, "raw", FRAME_RAWMODE)

    turn = UNROTATE.get(rotation % 4)
    if turn is not None:
        image = image.transpose(turn)

    os.makedirs(DATA_DIR, exist_ok=True)
    # Written beside and moved into place, so a reader never catches a half
    # written file -- the editor polls this and Home Assistant fetches it.
    temporary = screenshot_path(panel_id) + ".part"
    image.save(temporary, format="PNG", optimize=True)
    os.replace(temporary, screenshot_path(panel_id))

    meta = {
        "taken_at": time.time(),
        # The picture's own size, which is not the panel's when the device is
        # drawing at a quarter turn: the buffer is the panel's shape, but what
        # was drawn into it may be the other way round.
        "width": image.width,
        "height": image.height,
        "rotation": rotation,
        "bytes": os.path.getsize(screenshot_path(panel_id)),
    }
    with open(screenshot_meta_path(panel_id), "w", encoding="utf-8") as handle:
        json.dump(meta, handle)

    log.info("Stored a screenshot of %s: %d bytes as PNG", panel_id, meta["bytes"])
    return meta


def screenshot(panel_id: str) -> dict[str, Any] | None:
    """What is held for this panel, or None. The picture itself is served from
    screenshot_path()."""
    if not os.path.isfile(screenshot_path(panel_id)):
        return None
    try:
        with open(screenshot_meta_path(panel_id), encoding="utf-8") as handle:
            meta = json.load(handle)
    except (OSError, ValueError):
        # The picture is what matters; a lost sidecar should not hide it
        meta = {}
    meta.setdefault("taken_at", os.path.getmtime(screenshot_path(panel_id)))
    # Only reached when the sidecar is lost: the panel's own shape is the best
    # guess at what its picture is -- the *turned* shape, because that is what
    # was stored, not the buffer it arrived in.
    width, height = frame_size(panel_id)
    meta.setdefault("width", width)
    meta.setdefault("height", height)
    return meta


def save_log(panel_id: str, text: str, reason: str) -> dict[str, Any]:
    """Append what the device sent, oldest trimmed away first."""
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    header = f"\n===== {stamp} · from the device ({reason}) =====\n"
    body = header + text.rstrip("\n") + "\n"

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(log_path(panel_id), "a", encoding="utf-8") as handle:
        handle.write(body)

    _trim(panel_id)
    log.info("Stored %d bytes of device log (%s)", len(text), reason)
    return {"bytes": len(text), "reason": reason, "received_at": time.time()}


def _trim(panel_id: str) -> None:
    """Keep the newest LOG_LIMIT_BYTES, cut at a line boundary."""
    try:
        size = os.path.getsize(log_path(panel_id))
    except OSError:
        return
    if size <= LOG_LIMIT_BYTES:
        return

    with open(log_path(panel_id), "rb") as handle:
        handle.seek(size - LOG_LIMIT_BYTES)
        kept = handle.read()

    # The cut lands mid-line, so drop that fragment rather than leaving a partial
    # line that reads as something the device never printed.
    newline = kept.find(b"\n")
    if newline >= 0:
        kept = kept[newline + 1 :]

    with open(log_path(panel_id), "wb") as handle:
        handle.write(b"[...older entries dropped...]\n")
        handle.write(kept)


def device_log(panel_id: str) -> dict[str, Any]:
    """The whole log as text, newest last, with what is known about it."""
    if not os.path.isfile(log_path(panel_id)):
        return {"text": "", "bytes": 0, "received_at": None}
    with open(log_path(panel_id), encoding="utf-8", errors="replace") as handle:
        text = handle.read()
    return {
        "text": text,
        "bytes": len(text),
        "received_at": os.path.getmtime(log_path(panel_id)),
    }


def clear_log(panel_id: str) -> None:
    try:
        os.remove(log_path(panel_id))
    except OSError:
        pass
