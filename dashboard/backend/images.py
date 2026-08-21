"""Turn uploaded pictures into the packed 1-bit blobs the device draws directly.

All the scaling, cropping and dithering happens here rather than on the device.
The ESP32 would need seconds to decode a JPEG and has no memory to spare for it,
so what lands on the SD card is already the exact pixel size the widget occupies
and can go straight to drawBitmap.

The packing matches the firmware's iconConvert.py exactly -- MSB first, each row
starting on a byte boundary, a set bit meaning ink -- because the device draws
compiled-in icons and uploaded images through the same call.

    IPL1 file layout
    0  magic    "IPL1"
    4  version  1
    5  reserved 0
    6  width    uint16 little-endian
    8  height   uint16 little-endian
    10 payload  ceil(width / 8) * height bytes
"""

import hashlib
import io
import json
import logging
import os
import re
import struct
from typing import Any

from PIL import Image, ImageDraw, ImageOps

from settings import DATA_DIR

log = logging.getLogger(__name__)

MAGIC = b"IPL1"
VERSION = 1
HEADER = struct.Struct("<4sBBHH")

IMAGES_DIR = os.path.join(DATA_DIR, "images")
INDEX_PATH = os.path.join(IMAGES_DIR, "index.json")

# Names end up in a URL, a filename and a path on the SD card, so keep them dull.
NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,31}$")

# The panel, so an upload cannot ask for something that could never be drawn
MAX_WIDTH = 1280
MAX_HEIGHT = 720

# CARD_RADIUS in the firmware's CardWidget.h. A photo sitting among widgets
# looks like a mistake with square corners; matching their radius makes it look
# like it belongs. Kept in step by hand -- the manifest carries the grid, not
# the card styling, and this is the only thing on this side that needs it.
CORNER_RADIUS = 16


class ImageError(ValueError):
    """Raised for anything the user can fix by uploading something else."""


def normalise_name(raw: str) -> str:
    """A filename-safe name, derived from whatever the user typed."""
    name = re.sub(r"[^a-z0-9_-]+", "_", raw.strip().lower()).strip("_-")
    name = re.sub(r"_{2,}", "_", name)[:32]
    if not NAME_PATTERN.match(name):
        raise ImageError(
            f"'{raw}' does not give a usable name. Use letters, digits, - and _."
        )
    return name


def _pack(image: Image.Image) -> bytes:
    """A 1-bit PIL image to packed rows. Mirrors iconConvert.py."""
    width, height = image.size
    pixels = image.load()
    out = bytearray()
    for y in range(height):
        for x0 in range(0, width, 8):
            byte = 0
            for bit in range(8):
                x = x0 + bit
                # A dark pixel is ink, and short rows pad with light
                byte = (byte << 1) | (1 if x < width and pixels[x, y] == 0 else 0)
            out.append(byte)
    return bytes(out)


def _atkinson(image: Image.Image) -> Image.Image:
    """Grayscale to 1-bit with Atkinson dithering.

    PIL's own convert('1') is Floyd-Steinberg, which spreads all of the error and
    goes muddy on a display with no grey. Atkinson propagates only 3/4 of it,
    which clips highlights and shadows to solid black and white and reads far
    better on e-ink.
    """
    width, height = image.size
    pixels = [float(value) for value in image.getdata()]

    for y in range(height):
        for x in range(width):
            index = y * width + x
            old = pixels[index]
            new = 255.0 if old >= 128.0 else 0.0
            pixels[index] = new
            error = (old - new) / 8.0
            if error == 0.0:
                continue
            # (+1,0) (+2,0) (-1,+1) (0,+1) (+1,+1) (0,+2)
            for dx, dy in ((1, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (0, 2)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height:
                    pixels[ny * width + nx] += error

    out = Image.new("1", (width, height))
    out.putdata([255 if value >= 128.0 else 0 for value in pixels])
    return out


def _cover(image: Image.Image, width: int, height: int) -> Image.Image:
    """Scale to fill the box and crop the overflow, centred.

    Letterboxing a photo on a dashboard looks like a mistake; cropping looks
    deliberate. ImageOps.fit does exactly this.
    """
    return ImageOps.fit(image, (width, height), method=Image.LANCZOS, centering=(0.5, 0.5))


def _round_corners(bitmap: Image.Image, radius: int) -> Image.Image:
    """Clear the corners to paper, so the image reads as a card rather than a
    rectangle dropped on the page.

    After the dither, never before: rounding first would leave the corner pixels
    in the image for Atkinson to push error into, and the curve would come back
    speckled instead of clean.
    """
    width, height = bitmap.size
    radius = min(radius, width // 2, height // 2)
    if radius <= 0:
        return bitmap

    mask = Image.new("1", (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill=1)
    # White outside the curve. The blob has no transparency -- a set bit is ink
    # -- so "rounded" means the corners are paper, not that they are absent.
    return Image.composite(bitmap, Image.new("1", (width, height), 1), mask)


def convert(
    data: bytes,
    mode: str,
    width: int = 0,
    height: int = 0,
    rounded: bool = True,
) -> tuple[bytes, bytes, int, int]:
    """Uploaded bytes to (blob, preview_png, width, height).

    mode "exact"  keeps the image's own pixel size and only thresholds it, so
                  hand-drawn art stays exactly as drawn.
    mode "photo"  crops to fill width x height and dithers.

    rounded rounds the corners to the widgets' radius. Only meaningful for a
    photo: "exact" exists precisely so that what was drawn is what is drawn, and
    quietly eating its corners would break that promise.
    """
    try:
        source = Image.open(io.BytesIO(data))
        source.load()
    except Exception as error:
        raise ImageError(f"That file is not an image PIL can read ({error}).") from error

    # Flatten transparency onto white, or RGBA turns into black boxes
    if source.mode in ("RGBA", "LA", "P"):
        source = source.convert("RGBA")
        flattened = Image.new("RGBA", source.size, (255, 255, 255, 255))
        flattened.alpha_composite(source)
        source = flattened

    if mode == "exact":
        width, height = source.size
        if width > MAX_WIDTH or height > MAX_HEIGHT:
            raise ImageError(
                f"A pixel-accurate image has to fit the panel: {width}x{height} "
                f"is larger than {MAX_WIDTH}x{MAX_HEIGHT}. Resize it, or upload "
                f"it as a photo and let the add-on scale it."
            )
        # No dithering: the point of this mode is that what you drew is what
        # you get, so a mid-grey antialiased edge just picks a side.
        bitmap = source.convert("L").point(lambda value: 0 if value < 128 else 255, mode="1")
    elif mode == "photo":
        if not (0 < width <= MAX_WIDTH) or not (0 < height <= MAX_HEIGHT):
            raise ImageError(
                f"A photo needs a target size within {MAX_WIDTH}x{MAX_HEIGHT}, got {width}x{height}."
            )
        bitmap = _atkinson(_cover(source.convert("L"), width, height))
        if rounded:
            bitmap = _round_corners(bitmap, CORNER_RADIUS)
    else:
        raise ImageError(f"Unknown mode '{mode}'. Use 'exact' or 'photo'.")

    payload = _pack(bitmap)
    blob = HEADER.pack(MAGIC, VERSION, 0, width, height) + payload

    preview = io.BytesIO()
    bitmap.convert("L").save(preview, format="PNG", optimize=True)
    return blob, preview.getvalue(), width, height


# --- stored set -------------------------------------------------------------


def _load_index() -> dict[str, Any]:
    try:
        with open(INDEX_PATH, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return {}
    except (json.JSONDecodeError, OSError) as error:
        log.warning("Could not read the image index (%s), starting empty", error)
        return {}


def _save_index(index: dict[str, Any]) -> None:
    os.makedirs(IMAGES_DIR, exist_ok=True)
    with open(INDEX_PATH, "w", encoding="utf-8") as handle:
        json.dump(index, handle, indent=2, sort_keys=True)


def blob_path(name: str) -> str:
    return os.path.join(IMAGES_DIR, f"{name}.bin")


def preview_path(name: str) -> str:
    return os.path.join(IMAGES_DIR, f"{name}.png")


def store(
    name: str,
    data: bytes,
    mode: str,
    width: int = 0,
    height: int = 0,
    rounded: bool = True,
) -> dict[str, Any]:
    name = normalise_name(name)
    blob, preview, width, height = convert(data, mode, width, height, rounded)

    os.makedirs(IMAGES_DIR, exist_ok=True)
    with open(blob_path(name), "wb") as handle:
        handle.write(blob)
    with open(preview_path(name), "wb") as handle:
        handle.write(preview)

    entry = {
        "name": name,
        "mode": mode,
        # Recorded so the editor can show the toggle in the state it was
        # uploaded with, rather than snapping back to the default
        "rounded": bool(rounded) and mode == "photo",
        "width": width,
        "height": height,
        "bytes": len(blob),
        # The device compares this against what it already has on the card, so a
        # re-upload under the same name is picked up and an unchanged one is not
        # fetched again.
        "sha256": hashlib.sha256(blob).hexdigest(),
    }

    index = _load_index()
    index[name] = entry
    _save_index(index)
    log.info("Stored image %s (%s, %dx%d, %d bytes)", name, mode, width, height, len(blob))
    return entry


def remove(name: str) -> bool:
    index = _load_index()
    if name not in index:
        return False
    del index[name]
    _save_index(index)
    for path in (blob_path(name), preview_path(name)):
        try:
            os.remove(path)
        except OSError:
            pass
    return True


def listing() -> list[dict[str, Any]]:
    return sorted(_load_index().values(), key=lambda entry: entry["name"])


def manifest(base_url: str) -> dict[str, Any]:
    """What the device needs to decide which blobs to fetch."""
    return {"base_url": base_url.rstrip("/"), "images": listing()}
