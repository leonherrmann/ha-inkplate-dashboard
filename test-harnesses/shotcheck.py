"""Screenshots from a panel that can be stood on its side.

A framebuffer is always the *glass's* shape. The library maps drawing
coordinates on the way in, so an Inkplate 5 uploads 960x540 whichever way up it
is standing -- and the add-on used to read it at the shape the panel was
standing in. That gets two things wrong at once:

  * the byte count. 540 is not a multiple of 8, so `540 // 8 * 960` is 64,320
    against the 64,800 that actually arrives, and the upload is refused with a
    400. This is what a V1 on its side did.
  * the row stride, which garbles the picture. The V2 is the worse case: 720 and
    1280 are both multiples of 8, so the count matches by luck and the screenshot
    comes out scrambled with no error at all.

Neither is visible in a golden render -- the simulator draws the picture, and
this is about the buffer behind it. That distinction has already cost this
project an upside-down screenshot (v2026.9.10).

So each shape here packs a frame the way the device packs one, with a mark in a
known corner of the *drawn* image, and asserts the stored PNG is the turned
shape with the mark still in that corner.

    cd dashboard/backend
    PYTHONPATH=. /tmp/ink-venv/bin/python ../../test-harnesses/shotcheck.py
"""

import json
import os
import shutil
import sys

DATA = os.environ.setdefault("DATA_DIR", "/tmp/inkdata-shotcheck")
shutil.rmtree(DATA, ignore_errors=True)
os.makedirs(DATA, exist_ok=True)

from PIL import Image  # noqa: E402

import manifest_store  # noqa: E402
import reports  # noqa: E402

passes = 0
failures = 0


def check(ok, what):
    global passes, failures
    if ok:
        passes += 1
        print("ok   " + what)
    else:
        failures += 1
        print("FAIL " + what)


PANEL = "inkplate-a864a0"

# The two panels, and the grid each has standing up and on its side. The numbers
# are the firmware's; what matters here is only which way round they go.
PANELS = {
    "inkplate5v2": {"native": (1280, 720), "turned": (720, 1280)},
    "inkplate5v1": {"native": (960, 540), "turned": (540, 960)},
}

# What ConfigManager maps each orientation to. The device sends this with the
# upload, and it is what says how to turn the buffer back into a picture.
HARDWARE_ROTATION = {0: 2, 90: 3, 180: 0, 270: 1}


def manifest_for(model, orientation):
    native_w, native_h = PANELS[model]["native"]
    turned_w, turned_h = PANELS[model]["turned"]
    portrait = orientation in (90, 270)
    width, height = (turned_w, turned_h) if portrait else (native_w, native_h)
    shapes = {
        "landscape": {"width": native_w, "height": native_h, "cols": 5, "rows": 3,
                      "gap": 37, "gap_x": 37, "gap_y": 30, "margin_x": 41, "margin_y": 29,
                      "unit_w": 210, "unit_h": 172, "unit_h_off": 172, "chip_h": 56},
        "portrait": {"width": turned_w, "height": turned_h, "cols": 3, "rows": 6,
                     "gap": 22, "gap_x": 22, "gap_y": 22, "margin_x": 23, "margin_y": 23,
                     "unit_w": 210, "unit_h": 172, "unit_h_off": 172, "chip_h": 70},
    }
    return {
        "device": {"id": PANEL, "model": model},
        "display": {"width": width, "height": height, "model": model, "orientation": orientation},
        "grid": {k: v for k, v in shapes["portrait" if portrait else "landscape"].items()
                 if k not in ("width", "height")},
        "shapes": shapes,
        "widgets": [{"type": "clock", "label": "Clock", "sizes": [{"id": "2x1", "cols": 2, "rows": 1}]}],
    }


def pack(native_w, native_h, drawn_pixels, rotation, drawn_w, drawn_h):
    """A framebuffer as the device writes one.

    One bit per pixel, LSB first within each byte, a set bit is ink, rows a
    whole number of bytes -- and the drawing coordinates mapped through the
    library's rotation on the way in, which is the part that matters here.
    """
    stride = native_w // 8
    frame = bytearray(stride * native_h)
    for x, y in drawn_pixels:
        if rotation == 1:
            bx, by = drawn_h - y - 1, x
        elif rotation == 2:
            bx, by = drawn_w - x - 1, drawn_h - y - 1
        elif rotation == 3:
            bx, by = y, drawn_w - x - 1
        else:
            bx, by = x, y
        frame[stride * by + (bx >> 3)] |= 1 << (bx & 7)
    return bytes(frame)


for model in ("inkplate5v2", "inkplate5v1"):
    native_w, native_h = PANELS[model]["native"]
    for orientation in (0, 90, 180, 270):
        portrait = orientation in (90, 270)
        drawn_w, drawn_h = PANELS[model]["turned" if portrait else "native"]
        rotation = HARDWARE_ROTATION[orientation]

        manifest_store.save(json.dumps(manifest_for(model, orientation)).encode(), PANEL)

        print(f"--- {model} at {orientation} degrees ({drawn_w}x{drawn_h}) ---")

        check(
            reports.native_frame_size(PANEL) == (native_w, native_h),
            f"the buffer is the glass's own shape ({reports.native_frame_size(PANEL)})",
        )
        check(
            reports.frame_bytes(PANEL) == native_w // 8 * native_h,
            f"so its size is {native_w // 8 * native_h} bytes whichever way up it is "
            f"({reports.frame_bytes(PANEL)})",
        )

        # A mark in the top-left of the *drawn* picture, ten pixels square.
        mark = [(x, y) for y in range(10) for x in range(10)]
        raw = pack(native_w, native_h, mark, rotation, drawn_w, drawn_h)
        try:
            reports.save_screenshot(PANEL, raw, rotation)
            stored = Image.open(reports.screenshot_path(PANEL)).convert("1")
            accepted = True
        except ValueError as problem:
            accepted = False
            print("     " + str(problem))

        check(accepted, "a frame of that size is accepted")
        if not accepted:
            continue

        check(
            stored.size == (drawn_w, drawn_h),
            f"the picture is the shape the panel is standing in ({stored.size})",
        )

        pixels = stored.load()
        corner_is_ink = all(pixels[x, y] == 0 for x, y in mark)
        elsewhere_clear = pixels[drawn_w - 1, drawn_h - 1] != 0
        check(corner_is_ink, "and the top-left of what was drawn is the top-left of the picture")
        check(elsewhere_clear, "with the far corner still blank, so it was not turned the wrong way")

print(f"\n{passes + failures} checks, " + ("all screenshot checks passed" if not failures else f"{failures} FAILED"))
sys.exit(1 if failures else 0)
