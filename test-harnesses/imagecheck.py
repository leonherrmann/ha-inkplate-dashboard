"""What a picture turns into: the panel's bitmap, and the editor's preview.

`images._pack` writes the only format the firmware can draw. It is a handful of
lines with no user-visible behaviour of its own, which is exactly why it is worth
pinning: get the polarity backwards and every picture comes out a negative; lose
the mask on the right-hand edge and every picture whose width is not a multiple
of eight grows a black stripe down it -- which, on the panel sizes that are not
(215, 685, 710, 920), is most of them.

So each check here is against an **independent implementation**: the obvious
loop over every pixel, written out in `reference_pack` below. It is far too slow
to ship -- it was the second-largest cost in a conversion, a million iterations
for a full-screen picture -- but it is easy to read and obviously right, which is
what an oracle has to be. The fast one has to agree with it on every shape.

The same goes for the dither: `_diffuse` runs a fast path for pixels that cannot
be near an edge, and `reference_diffuse` is the version with all the checks left
in. They have to produce identical bytes, not similar ones -- the editor previews
the result in JavaScript and tools/dithercheck.py holds that to the bit.

Run from dashboard/backend with a python3.13 venv -- the python3 on PATH is
miniconda 3.8 and cannot parse this backend:

    cd dashboard/backend
    PYTHONPATH=. /tmp/ink-venv/bin/python ../../test-harnesses/imagecheck.py
"""

import io
import os
import random
import shutil
import struct
import sys

DATA = os.environ.setdefault("DATA_DIR", "/tmp/inkdata-imagecheck")
shutil.rmtree(DATA, ignore_errors=True)
os.makedirs(DATA, exist_ok=True)

from PIL import Image  # noqa: E402

import images  # noqa: E402

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


def reference_pack(image):
    """The obvious loop: MSB first, a dark pixel is ink, short rows pad light."""
    width, height = image.size
    pixels = image.load()
    out = bytearray()
    for y in range(height):
        for x0 in range(0, width, 8):
            byte = 0
            for bit in range(8):
                x = x0 + bit
                byte = (byte << 1) | (1 if x < width and pixels[x, y] == 0 else 0)
            out.append(byte)
    return bytes(out)


def reference_diffuse(image, taps, divisor):
    """Error diffusion with every bounds check left in, for every pixel."""
    width, height = image.size
    pixels = [float(value) for value in image.getdata()]
    for y in range(height):
        for x in range(width):
            index = y * width + x
            old = pixels[index]
            new = 255.0 if old >= 128.0 else 0.0
            pixels[index] = new
            error = old - new
            if error == 0.0:
                continue
            for dx, dy, weight in taps:
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height:
                    pixels[ny * width + nx] += error * weight / divisor
    out = Image.new("1", (width, height))
    out.putdata([255 if value >= 128.0 else 0 for value in pixels])
    return out


def bitmap(width, height, kind, seed=0):
    """A 1-bit test picture. `putdata` rather than pixel assignment: assigning a
    bare 1 to a mode "1" pixel stores 1 where PIL's own buffer stores 255, and a
    comparison against a round-tripped image then fails for no reason."""
    random.seed(seed)
    if kind == "noise":
        values = [random.choice((0, 255)) for _ in range(width * height)]
    elif kind == "ink":
        values = [0] * (width * height)
    elif kind == "paper":
        values = [255] * (width * height)
    elif kind == "right-edge":
        # Ink only in the last three columns, where the pad bits live.
        values = [0 if x >= width - 3 else 255 for y in range(height) for x in range(width)]
    else:
        raise ValueError(kind)
    out = Image.new("1", (width, height))
    out.putdata(values)
    return out


# Widths covering every remainder mod 8, and the real ones: a V1 1x2 card is 215
# wide, a V2 3x2 is 710, a V1 full screen 960.
SHAPES = [
    (1, 1), (2, 3), (7, 7), (8, 8), (9, 9), (15, 4), (16, 4), (17, 4),
    (61, 61), (200, 1), (1, 200), (215, 424), (215, 194), (685, 408),
    (710, 362), (920, 500), (960, 540),
]


print("--- packing, against the loop it replaced ---")

for width, height in SHAPES:
    same = True
    for kind in ("noise", "ink", "paper", "right-edge"):
        picture = bitmap(width, height, kind, seed=width * height)
        if images._pack(picture) != reference_pack(picture):
            same = False
    check(same, f"{width}x{height} packs identically, whatever is on it")


print("--- what the bits mean ---")

solid_ink = images._pack(bitmap(16, 2, "ink"))
check(solid_ink == b"\xff" * 4, f"a page of ink is every bit set ({solid_ink.hex()})")
check(images._pack(bitmap(16, 2, "paper")) == b"\x00" * 4, "and blank paper is none of them")

# 12 wide is a byte and a half, so the low four bits of the second byte are
# padding. Ink in the last three columns puts x9, x10 and x11 in the high half.
edge = images._pack(bitmap(12, 1, "right-edge"))
check(len(edge) == 2, f"a 12px row is two bytes ({len(edge)})")
check(
    edge == bytes((0b00000000, 0b01110000)),
    f"with the ink where the picture is ({edge.hex()})",
)
check(
    not edge[1] & 0b00001111,
    "and the pad bits paper, rather than ink running off the edge of the picture",
)

tall = images._pack(bitmap(12, 3, "paper"))
check(len(tall) == 6, f"every row starts on a byte boundary ({len(tall)} for 3 rows of 12px)")


print("--- the blob the firmware reads ---")

blob, preview, width, height = images._finish(bitmap(215, 424, "noise"), 0)
magic, version, flags, blob_w, blob_h = images.HEADER.unpack(blob[: images.HEADER.size])
check(magic == images.MAGIC, "it starts with the magic the firmware looks for")
check((blob_w, blob_h) == (215, 424), f"and carries its own size ({blob_w}x{blob_h})")
check(
    len(blob) == images.HEADER.size + ((215 + 7) // 8) * 424,
    f"the payload is exactly the packed rows ({len(blob)} bytes)",
)


print("--- the preview the editor shows ---")

for width, height in [(215, 424), (710, 362)]:
    picture = bitmap(width, height, "noise", seed=width)
    blob, preview, _, _ = images._finish(picture, 0)
    shown = Image.open(io.BytesIO(preview))
    check(shown.size == (width, height), f"{width}x{height} preview is the picture's own size")
    check(
        shown.convert("1").tobytes() == picture.convert("1").tobytes(),
        "and its pixels are the ones that went to the panel, not a re-dither",
    )
    # A 1-bit PNG rather than an 8-bit one: same pixels, a fraction of the work,
    # and a smaller file. Bit depth lives in byte 24 of the IHDR.
    check(preview[24] == 1, f"stored at 1 bit per pixel ({preview[24]})")


print("--- the dither's fast path against the checked one ---")


def taps_of(name):
    """The taps a dither actually uses, taken from the dither rather than copied.

    A copy here would be a second opinion about the one thing dither.js has to
    match, and it would go stale silently. So `_diffuse` is watched for one call
    instead: whatever it was handed is what the reference gets.
    """
    seen = {}
    real = images._diffuse

    def spy(image, taps, divisor):
        seen["taps"], seen["divisor"] = taps, divisor
        return real(image, taps, divisor)

    images._diffuse = spy
    try:
        images.DITHERS[name](Image.new("L", (2, 2), 128))
    finally:
        images._diffuse = real
    return seen.get("taps"), seen.get("divisor")


diffusing = {name: taps_of(name) for name in images.DITHERS}
check(
    sum(1 for taps, _ in diffusing.values() if taps) == 2,
    "two of the three dithers diffuse error, and this found them "
    f"({', '.join(sorted(name for name, (taps, _) in diffusing.items() if taps))})",
)

for width, height in [(1, 1), (3, 3), (9, 2), (2, 9), (17, 17), (215, 194), (200, 60)]:
    source = Image.new("L", (width, height))
    random.seed(width * 31 + height)
    source.putdata([random.randint(0, 255) for _ in range(width * height)])
    for name, (taps, divisor) in sorted(diffusing.items()):
        if not taps:
            continue
        fast = images._dither(source, name)
        slow = reference_diffuse(source, taps, divisor)
        check(
            images._pack(fast) == images._pack(slow),
            f"{name} on {width}x{height} is bit for bit what the checked loop gives",
        )


print(f"\n{passes + failures} checks, " + ("all image checks passed" if not failures else f"{failures} FAILED"))
sys.exit(1 if failures else 0)
