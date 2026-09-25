"""The move from the 220x166 grid onto the shared 210x172 cell (store generation 3).

    cd ha-inkplate-dashboard/dashboard/backend
    PYTHONPATH=. /tmp/ink-venv/bin/python ../../test-harnesses/gridmigratecheck.py

Found 2026-09-24: a V2 whose layout was never touched after the cells changed
was still on the old grid -- cards at 30 + 250k, chips at y 618. The panel drew
it right, because a layout pushed without `laid_out_for` is re-fitted on
arrival; the editor drew it as it stood, a few pixels off every cell and 17px
above the chip row. And the next push would have stamped it with the new grid,
at which point the panel would have drawn it wrong too.

The manifests are the firmware's own, dumped with `./sim/preview --manifest` and
`./sim/preview-v1 --manifest`, so the target grid is one a panel really has.
"""

import copy
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ["DATA_DIR"] = tempfile.mkdtemp()

import manifest_store  # noqa: E402
import store  # noqa: E402

passes = 0
failures = 0


def check(ok: bool, what: str) -> None:
    global passes, failures
    if ok:
        passes += 1
        print("ok   " + what)
    else:
        failures += 1
        print("FAIL " + what)


def remember(panel_id: str, filename: str) -> dict:
    with open(os.path.join(HERE, filename), encoding="utf-8") as handle:
        manifest = json.load(handle)
    manifest["device"]["id"] = panel_id
    manifest_store.save(json.dumps(manifest), panel_id)
    return manifest


V2 = "inkplate-000002"
V1 = "inkplate-000001"
v2 = remember(V2, "manifest.json")
remember(V1, "manifest-v1.json")
widths = {entry["type"]: entry["width"] for entry in v2["widgets"] if entry.get("chip")}
grid = v2["shapes"]["landscape"]

# The shape of the layout that was found: a dashboard page on the old grid with
# the status chips pushed against the right margin, and a full-screen page.
OLD = {
    "version": 3,
    "grid_generation": 2,
    "pages": [
        {
            "id": "main", "chip_row": "bottom",
            "widgets": [
                {"id": "a", "type": "room", "size": "3x2", "x": 30, "y": 226},
                {"id": "b", "type": "clock", "size": "2x1", "x": 30, "y": 30},
                {"id": "c", "type": "photo", "size": "2x3", "x": 780, "y": 30},
                {"id": "d", "type": "battery", "x": 1075, "y": 618},
                {"id": "e", "type": "wifi", "x": 965, "y": 618},
                {"id": "f", "type": "mqtt", "x": 855, "y": 618},
                {"id": "g", "type": "update", "x": 30, "y": 618},
            ],
        },
        {
            "id": "full", "chip_row": "off",
            "widgets": [{"id": "h", "type": "photo", "size": "5x3", "x": 30, "y": 30}],
        },
    ],
}

moved = store._migrate(copy.deepcopy(OLD), V2)
at = {w["id"]: w for page in moved["pages"] for w in page["widgets"]}
pitch_x = grid["unit_w"] + grid["gap_x"]
pitch_y = grid["unit_h"] + grid["gap_y"]
row_y = grid["height"] - grid["margin_y"] - grid["chip_h"]

print("--- a V2 layout on the old grid ---")
check(moved["grid_generation"] == 3, "it is marked as on the new grid")
check((at["b"]["x"], at["b"]["y"]) == (grid["margin_x"], grid["margin_y"]),
      f"the first cell's card is on the first cell ({at['b']['x']}, {at['b']['y']})")
check((at["a"]["x"], at["a"]["y"]) == (grid["margin_x"], grid["margin_y"] + pitch_y),
      f"a card in row 1 stays in row 1 ({at['a']['y']})")
check(at["c"]["x"] == grid["margin_x"] + 3 * pitch_x,
      f"a card in column 3 stays in column 3 ({at['c']['x']})")
band = grid["rows"] * grid["unit_h"] + (grid["rows"] - 1) * grid["gap_y"]
check(at["h"]["y"] == (grid["height"] - band) // 2,
      f"a full-screen page with no chip row is centred ({at['h']['y']})")
chips = sorted((at[k] for k in "defg"), key=lambda w: w["x"])
check(all(w["y"] == row_y for w in chips), f"every chip is on the row at {row_y}")
check(at["d"]["x"] + widths["battery"] == grid["width"] - grid["margin_x"],
      f"the battery that was against the right margin still is ({at['d']['x']} + {widths['battery']})")
check(at["g"]["x"] == grid["margin_x"], "the chip against the left margin still is")
check(all(b["x"] >= a["x"] + widths[a["type"]] + grid["gap_x"] for a, b in zip(chips, chips[1:])),
      "no two chips closer than a gap")
check([w["id"] for w in chips] == ["g", "f", "e", "d"], "and the row keeps its order")
check(store._migrate(copy.deepcopy(moved), V2) == moved, "running it again changes nothing")

print("--- a layout already on its panel's grid ---")
native = copy.deepcopy(moved)
native["grid_generation"] = 2
check(store._migrate(copy.deepcopy(native), V2)["pages"] == moved["pages"],
      "a V2 layout on the new grid is left exactly where it is")
v1_layout = {
    "grid_generation": 2,
    "pages": [{"id": "p", "chip_row": "bottom", "widgets": [
        {"id": "a", "type": "clock", "size": "2x1", "x": 21, "y": 38},
        {"id": "b", "type": "wifi", "x": 21, "y": 446},
    ]}],
}
kept = store._migrate(copy.deepcopy(v1_layout), V1)
check([p["widgets"] for p in kept["pages"]] == [p["widgets"] for p in v1_layout["pages"]]
      and kept["grid_generation"] == 3,
      "a V1 layout on its own grid is left where it is, and marked")
check(store._migrate(copy.deepcopy({"grid_generation": 2, "pages": []}), V2)["grid_generation"] == 3,
      "an empty layout is marked without anything to move")

print(f"\n{passes + failures} checks, "
      + ("all grid migration checks passed" if failures == 0 else f"{failures} FAILED"))
sys.exit(0 if failures == 0 else 1)
