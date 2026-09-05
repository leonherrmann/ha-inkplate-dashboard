#!/usr/bin/env python3
"""Prove the browser's dither and the backend's produce identical pixels.

    dashboard/tools/dithercheck.py

The crop editor shows a live 1-bit preview while you drag, which means the
dither exists twice: in frontend/src/dither.js for the preview and in
backend/images.py for what actually ships. Two implementations of the same
algorithm drift, and the failure mode is the worst kind -- the preview keeps
looking plausible while disagreeing with the panel about which pixels are ink.

So this runs both over the same greyscale bitmaps and demands they match byte
for byte. Not "close": identical. Both sides accumulate error in IEEE doubles
in raster order, so there is no rounding to be generous about, and any
difference at all means one of them was edited and the other was not.

Needs node, which the frontend build already requires.
"""

import io
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
DASHBOARD = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(DASHBOARD, "backend"))

# images.py imports settings for DATA_DIR, which wants somewhere to exist
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="dithercheck-"))

from PIL import Image  # noqa: E402

import images  # noqa: E402

DITHER_JS = os.path.join(DASHBOARD, "frontend", "src", "dither.js")

RUNNER = """
import { dither } from %(module)s;
import { readFileSync, writeFileSync } from "node:fs";

const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = {};
for (const [name, case_] of Object.entries(spec.cases)) {
  const gray = Uint8ClampedArray.from(case_.gray);
  const bits = dither(gray, case_.width, case_.height, case_.dither);
  out[name] = Array.from(bits);
}
writeFileSync(process.argv[3], JSON.stringify(out));
"""


def fixtures():
    """Greyscale bitmaps chosen to exercise the parts that differ if they can.

    A flat field proves nothing on its own -- every dither agrees on solid
    black. What catches a divergence is error that has somewhere to travel:
    gradients, edges, and values sitting right on the 128 boundary where a
    hair of accumulated difference flips a pixel.
    """
    cases = {}

    # A diagonal ramp: error runs in both axes at once
    width, height = 61, 37
    ramp = Image.new("L", (width, height))
    ramp.putdata([(x * 255) // (width + height) + (y * 255) // (width + height)
                  for y in range(height) for x in range(width)])
    cases["ramp"] = ramp

    # Everything exactly on the threshold, where the smallest difference shows
    cases["on_the_edge"] = Image.new("L", (23, 19), 128)

    # Hard edges beside flat areas, which is what a logo looks like
    logo = Image.new("L", (40, 40), 255)
    for y in range(40):
        for x in range(40):
            if 8 <= x < 32 and 14 <= y < 26:
                logo.putpixel((x, y), 0)
            elif (x + y) % 7 == 0:
                logo.putpixel((x, y), 90)
    cases["logo"] = logo

    # Deterministic pseudo-noise, standing in for a photograph's texture.
    # A fixed generator rather than random(), so a failure can be reproduced.
    seed = 12345
    values = []
    for _ in range(53 * 43):
        seed = (1103515245 * seed + 12345) % (2 ** 31)
        values.append(seed % 256)
    noise = Image.new("L", (53, 43))
    noise.putdata(values)
    cases["noise"] = noise

    # One pixel wide and one tall: the loops' edge handling
    cases["hairline"] = Image.new("L", (1, 25), 160)
    cases["scanline"] = Image.new("L", (25, 1), 160)

    return cases


def main() -> int:
    if not os.path.isfile(DITHER_JS):
        print(f"no {DITHER_JS}", file=sys.stderr)
        return 2

    cases = fixtures()
    spec = {"cases": {}}
    expected = {}

    for name, image in sorted(cases.items()):
        for dither_name in sorted(images.DITHERS):
            key = f"{name}/{dither_name}"
            width, height = image.size
            spec["cases"][key] = {
                "gray": list(image.getdata()),
                "width": width,
                "height": height,
                "dither": dither_name,
            }
            # PIL's "1" mode gives 0 or 255 per pixel through getdata()
            result = images._dither(image, dither_name)
            expected[key] = [255 if value else 0 for value in result.convert("L").getdata()]

    work = tempfile.mkdtemp(prefix="dithercheck-")
    spec_path = os.path.join(work, "spec.json")
    out_path = os.path.join(work, "out.json")
    runner_path = os.path.join(work, "runner.mjs")

    with open(spec_path, "w") as handle:
        json.dump(spec, handle)
    with open(runner_path, "w") as handle:
        handle.write(RUNNER % {"module": json.dumps("file://" + DITHER_JS)})

    result = subprocess.run(
        ["node", runner_path, spec_path, out_path],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print("node failed:\n" + result.stdout + result.stderr, file=sys.stderr)
        return 2

    with open(out_path) as handle:
        actual = json.load(handle)

    failures = 0
    for key in sorted(expected):
        want = expected[key]
        got = actual.get(key)
        if got is None:
            print(f"FAIL {key}: the browser side produced nothing")
            failures += 1
            continue
        if got == want:
            print(f"ok   {key}")
            continue
        differing = sum(1 for a, b in zip(want, got) if a != b)
        first = next(i for i, (a, b) in enumerate(zip(want, got)) if a != b)
        print(f"FAIL {key}: {differing} of {len(want)} pixels differ, "
              f"first at index {first}")
        failures += 1

    total = len(expected)
    if failures:
        print(f"\n{failures} of {total} cases differ -- the live preview is lying")
        return 1
    print(f"\n{total} cases, the browser and the backend agree pixel for pixel")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
