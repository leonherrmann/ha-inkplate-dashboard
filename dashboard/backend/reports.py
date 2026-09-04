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

from settings import DATA_DIR

log = logging.getLogger(__name__)

SCREENSHOT_PATH = os.path.join(DATA_DIR, "screenshot.png")
SCREENSHOT_META = os.path.join(DATA_DIR, "screenshot.json")
LOG_PATH = os.path.join(DATA_DIR, "device-log.txt")

# The panel, in the only mode this firmware uses it in. A screenshot is the
# framebuffer verbatim, so its length is fixed and anything else is a mistake
# rather than a smaller picture.
PANEL_WIDTH = 1280
PANEL_HEIGHT = 720
FRAME_BYTES = PANEL_WIDTH // 8 * PANEL_HEIGHT

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


def save_screenshot(raw: bytes) -> dict[str, Any]:
    """Store the framebuffer as a PNG. Raises ValueError if it is not one."""
    if len(raw) != FRAME_BYTES:
        raise ValueError(
            f"Expected {FRAME_BYTES} bytes of framebuffer, got {len(raw)}"
        )

    image = Image.frombytes("1", (PANEL_WIDTH, PANEL_HEIGHT), raw, "raw", FRAME_RAWMODE)

    os.makedirs(DATA_DIR, exist_ok=True)
    # Written beside and moved into place, so a reader never catches a half
    # written file -- the editor polls this and Home Assistant fetches it.
    temporary = SCREENSHOT_PATH + ".part"
    image.save(temporary, format="PNG", optimize=True)
    os.replace(temporary, SCREENSHOT_PATH)

    meta = {
        "taken_at": time.time(),
        "width": PANEL_WIDTH,
        "height": PANEL_HEIGHT,
        "bytes": os.path.getsize(SCREENSHOT_PATH),
    }
    with open(SCREENSHOT_META, "w", encoding="utf-8") as handle:
        json.dump(meta, handle)

    log.info("Stored a screenshot: %d bytes as PNG", meta["bytes"])
    return meta


def screenshot() -> dict[str, Any] | None:
    """What is held, or None. The picture itself is served from SCREENSHOT_PATH."""
    if not os.path.isfile(SCREENSHOT_PATH):
        return None
    try:
        with open(SCREENSHOT_META, encoding="utf-8") as handle:
            meta = json.load(handle)
    except (OSError, ValueError):
        # The picture is what matters; a lost sidecar should not hide it
        meta = {}
    meta.setdefault("taken_at", os.path.getmtime(SCREENSHOT_PATH))
    meta.setdefault("width", PANEL_WIDTH)
    meta.setdefault("height", PANEL_HEIGHT)
    return meta


def save_log(text: str, reason: str) -> dict[str, Any]:
    """Append what the device sent, oldest trimmed away first."""
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    header = f"\n===== {stamp} · from the device ({reason}) =====\n"
    body = header + text.rstrip("\n") + "\n"

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as handle:
        handle.write(body)

    _trim()
    log.info("Stored %d bytes of device log (%s)", len(text), reason)
    return {"bytes": len(text), "reason": reason, "received_at": time.time()}


def _trim() -> None:
    """Keep the newest LOG_LIMIT_BYTES, cut at a line boundary."""
    try:
        size = os.path.getsize(LOG_PATH)
    except OSError:
        return
    if size <= LOG_LIMIT_BYTES:
        return

    with open(LOG_PATH, "rb") as handle:
        handle.seek(size - LOG_LIMIT_BYTES)
        kept = handle.read()

    # The cut lands mid-line, so drop that fragment rather than leaving a partial
    # line that reads as something the device never printed.
    newline = kept.find(b"\n")
    if newline >= 0:
        kept = kept[newline + 1 :]

    with open(LOG_PATH, "wb") as handle:
        handle.write(b"[...older entries dropped...]\n")
        handle.write(kept)


def device_log() -> dict[str, Any]:
    """The whole log as text, newest last, with what is known about it."""
    if not os.path.isfile(LOG_PATH):
        return {"text": "", "bytes": 0, "received_at": None}
    with open(LOG_PATH, encoding="utf-8", errors="replace") as handle:
        text = handle.read()
    return {
        "text": text,
        "bytes": len(text),
        "received_at": os.path.getmtime(LOG_PATH),
    }


def clear_log() -> None:
    try:
        os.remove(LOG_PATH)
    except OSError:
        pass
