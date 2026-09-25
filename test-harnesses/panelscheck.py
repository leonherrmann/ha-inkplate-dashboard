"""Several panels, each with its own dashboard.

The add-on managed one panel for its whole life, and a great deal of it said so
in ways that only showed up when a second one arrived: one layout file, one
manifest, one set of MQTT topics, one Home Assistant device. This checks the
seams that replaced them -- that a panel introduces itself, that two panels do
not read or write each other's dashboards, that an install from before this
keeps the dashboard it already had, and that the API is about the panel it was
asked about.

Run from dashboard/backend with a python3.13 venv -- the python3 on PATH is
miniconda 3.8 and cannot parse this backend:

    cd dashboard/backend
    PYTHONPATH=. /tmp/ink-venv/bin/python ../../test-harnesses/panelscheck.py
"""

import json
import os
import shutil
import sys

DATA = os.environ.setdefault("DATA_DIR", "/tmp/inkdata-panelscheck")
shutil.rmtree(DATA, ignore_errors=True)
os.makedirs(DATA, exist_ok=True)

from fastapi.testclient import TestClient  # noqa: E402

import grids  # noqa: E402
import manifest_store  # noqa: E402
import panels  # noqa: E402
import store  # noqa: E402
from device_api import app as device_app  # noqa: E402
from main import app as editor_app  # noqa: E402
from settings import topics  # noqa: E402

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


V2 = "inkplate-a864a0"
V1 = "inkplate-64a012"


def manifest_for(panel_id, model, grid, display):
    """A manifest as current firmware publishes one.

    `shapes` carries both ways the panel can stand, because a page keeps an
    arrangement for each and the editor has to lay out against the shape the
    panel is *not* in. The sideways block here is the real arithmetic for these
    panels: the same cell, turned, with its own gaps and margins.
    """
    portrait = {
        "width": display["height"],
        "height": display["width"],
        "unit_w": grid["unit_w"],
        "unit_h": grid["unit_h"],
        "unit_h_off": grid["unit_h_off"],
        "cols": 3 if model == "inkplate5v2" else 2,
        "rows": 6 if model == "inkplate5v2" else 4,
        "gap": 22 if model == "inkplate5v2" else 40,
        "gap_x": 22 if model == "inkplate5v2" else 40,
        "gap_y": 22 if model == "inkplate5v2" else 38,
        "margin_x": 23 if model == "inkplate5v2" else 40,
        "margin_y": 23 if model == "inkplate5v2" else 32,
        "chip_h": 70 if model == "inkplate5v2" else 56,
    }
    landscape = {**grid, "width": display["width"], "height": display["height"]}
    return {
        "device": {"id": panel_id, "model": model},
        "display": {**display, "model": model},
        "grid": grid,
        "shapes": {"landscape": landscape, "portrait": portrait},
        "widgets": [{"type": "clock", "label": "Clock", "sizes": [{"id": "2x1", "cols": 2, "rows": 1}]}],
    }


print("--- the topic contract ---")

check(
    topics.device(V2).config_set == f"{topics.root}/devices/{V2}/config/set",
    f"a panel's layout goes to its own topic ({topics.device(V2).config_set})",
)
check(
    topics.device(V1).status != topics.device(V2).status,
    "two panels do not share a status topic",
)
check(
    topics.every_device("status") == f"{topics.root}/devices/+/status",
    "and one wildcard covers every panel, present or future",
)
check(
    topics.panel_of(f"{topics.root}/devices/{V1}/config/current") == V1,
    "a message names the panel it came from",
)
check(
    topics.leaf_of(f"{topics.root}/devices/{V1}/config/current") == "config/current",
    "and what it is about",
)
check(topics.panel_of(f"{topics.root}/state/sensor.x") is None, "a shared topic is nobody's")
# The entity states stay shared: republishing three hundred readings per panel
# would multiply the broker traffic to say the same thing to each of them.
check(
    topics.state("sensor.x") == f"{topics.root}/state/sensor.x",
    "the entity states are not under a panel at all",
)


print("--- a panel introduces itself ---")

check(panels.all() == [], "nothing is known before a panel speaks")
check(panels.default_id() is None, "and there is no default")

device = TestClient(device_app)
response = device.post(
    "/device/manifest",
    content=json.dumps(
        manifest_for(
            V2,
            "inkplate5v2",
            {"gap": 37, "gap_x": 37, "gap_y": 30, "margin_x": 41, "margin_y": 29,
             "unit_w": 210, "unit_h": 172, "unit_h_off": 172, "cols": 5, "rows": 3, "chip_h": 56},
            {"width": 1280, "height": 720},
        )
    ).encode(),
)
check(response.status_code == 200, "a manifest is all it takes to appear")
check([panel["id"] for panel in panels.all()] == [V2], "the panel is in the list")
check(panels.get(V2)["model"] == "inkplate5v2", "with the model it declared")
check(
    panels.get(V2)["name"] == "Inkplate 5 V2 a864a0",
    f"and a name nobody has to type ({panels.get(V2)['name']})",
)

device.post(
    "/device/manifest",
    content=json.dumps(
        manifest_for(
            V1,
            "inkplate5v1",
            {"gap": 26, "gap_x": 26, "gap_y": 32, "margin_x": 21, "margin_y": 38,
             "unit_w": 210, "unit_h": 172, "unit_h_off": 172, "cols": 4, "rows": 2, "chip_h": 56},
            {"width": 960, "height": 540},
        )
    ).encode(),
)
check(len(panels.all()) == 2, "a second panel joins it")
check(panels.default_id() == V2, "the first one seen stays the default")


print("--- each panel's grid is its own ---")

check(grids.of(V2).cols == 5 and grids.of(V2).unit_h == 172, "the V2 keeps 5x3 of 210x172")
check(grids.of(V1).cols == 4 and grids.of(V1).unit_h == 172, "the V1 has 4x2 of the same 210x172")
check(
    grids.of(V1).box(2, 1, "bottom") == (446, 172),
    f"a 2x1 is {grids.of(V1).box(2, 1, 'bottom')} there and {grids.of(V2).box(2, 1, 'bottom')} on the V2",
)
check(grids.of("inkplate-nobody").cols == 5, "an unknown panel falls back to the V2's grid")


print("--- each panel's dashboard is its own ---")

editor = TestClient(editor_app)

one = editor.get(f"/api/layout?panel={V2}").json()
one["pages"][0]["name"] = "Hallway"
one["pages"][0]["widgets"] = [{"id": "w1", "type": "clock", "size": "2x1", "x": 30, "y": 30}]
check(editor.put(f"/api/layout?panel={V2}", json=one).status_code == 200, "one panel is edited")

two = editor.get(f"/api/layout?panel={V1}").json()
check(two["pages"][0].get("widgets") == [], "the other is still empty")
two["pages"][0]["name"] = "Bench"
editor.put(f"/api/layout?panel={V1}", json=two)

check(
    editor.get(f"/api/layout?panel={V2}").json()["pages"][0]["name"] == "Hallway",
    "and editing it does not touch the first",
)
check(
    editor.get(f"/api/layout?panel={V1}").json()["pages"][0]["name"] == "Bench",
    "each reads back what was written to it",
)
check(
    os.path.isfile(store.layout_path(V2)) and os.path.isfile(store.layout_path(V1)),
    "they are two files on disk",
)


print("--- the settings on the Device screen are the panel's own ---")
#
# Orientation, screen refresh, night sleep and the timer cadence are all stored
# in the layout, so they are per panel by construction -- but that is exactly
# the kind of thing that is true until somebody adds a setting elsewhere, and
# the Device screen is where all of them are changed.

settings = editor.get(f"/api/layout?panel={V2}").json()
settings["orientation"] = 180
settings["refresh"] = {"ghost_percent": 25}
settings["sleep"] = {"enabled": True, "start": "22:00", "end": "07:00", "wake_minutes": 15}
settings["timer_tick_ms"] = 2500
editor.put(f"/api/layout?panel={V2}", json=settings)

other = editor.get(f"/api/layout?panel={V1}").json()
check(other.get("orientation") == 0, "turning one panel over leaves the other upright")
check(
    (other.get("refresh") or {}).get("ghost_percent") == 12,
    "its ghost tolerance is its own",
)
check(not (other.get("sleep") or {}).get("enabled"), "and so is its night sleep")
check(other.get("timer_tick_ms") is None, "and its timer cadence")
check(
    editor.get(f"/api/layout?panel={V2}").json()["orientation"] == 180,
    "while the panel that was changed kept the change",
)


print("--- the API answers about the panel it was asked about ---")

status = editor.get(f"/api/status?panel={V1}").json()
check(status["device_id"] == V1, "status names the panel")
check(status["manifest"]["display"]["width"] == 960, "and carries that panel's manifest")
check(
    editor.get(f"/api/status?panel={V2}").json()["manifest"]["display"]["width"] == 1280,
    "the other panel's is unaffected",
)
check(
    editor.get("/api/status").json()["device_id"] == V2,
    "no panel given means the default, so an old link still works",
)

listed = editor.get("/api/panels").json()
check(len(listed["panels"]) == 2, "the dropdown gets both")
check(
    {panel["id"] for panel in listed["panels"]} == {V1, V2},
    "by id",
)
check(
    all("width" in panel and "online" in panel for panel in listed["panels"]),
    "each with the shape and the health the list shows",
)


print("--- announcing a panel that has said what it is running ---")
#
# The fault this exists for, found in production on 2026-09-19: an editor whose
# every layout save answered 500. `publish_firmware_state` referred to a name
# defined in *another* function, and the line was only reached once a panel had
# reported a running version -- so every harness sailed past it, because none of
# them had given a panel any stats. Announcing is on the path of every save.

from mqtt import link  # noqa: E402

link.panel(V2).stats = {"firmware": {"running": "v2026.9.51"}, "voltage": 3.9, "battery": 88}
link.panel(V1).stats = {"firmware": {"running": "v2026.9.51"}, "voltage": 4.0, "battery": 100}

saved = editor.get(f"/api/layout?panel={V2}").json()
response = editor.put(f"/api/layout?panel={V2}", json=saved)
check(response.status_code == 200, f"saving a layout answers {response.status_code}, not 500")

# Straight at the announce, so a failure names the announce rather than a route.
try:
    link.announce()
    announced = True
except Exception as error:  # noqa: BLE001 - the point is to catch anything
    announced = False
    print("     " + repr(error))
check(announced, "and announcing every panel does not raise")


print("--- the firmware offers follow the panels ---")
#
# They used to be published at startup and when a release changed, so a panel
# switched on in between was offered nothing until one of those happened again
# -- and which board the one shared topic carried was an add-on *option*, which
# meant somebody had to know, and had to be right.

import firmware  # noqa: E402
import main  # noqa: E402

firmware.store.state = {
    "version": "v2026.9.60",
    "builds": {
        "inkplate5v2": {"bytes": 10, "sha256": "a" * 64},
        "inkplate5v1": {"bytes": 10, "sha256": "b" * 64},
    },
}
firmware.store.have_binary = lambda model=None: True  # the files are not the subject here

link.panel(V2).stats = {"firmware": {"running": "v2026.9.60"}}
link.panel(V1).stats = {"firmware": {"running": "dev"}}
check(main._models_behind() == ["inkplate5v1"], "only the panel that is behind counts as behind")
check(
    firmware.store.shared_model(main._models_behind()) == "inkplate5v1",
    "so the one shared topic is handed to it, with nothing configured",
)

link.panel(V2).stats = {"firmware": {"running": "dev"}}
check(
    firmware.store.shared_model(main._models_behind()) == firmware.LEGACY_MODEL,
    "and taken back the moment a legacy panel needs it, which is the one that can only read that topic",
)

# A panel that has never reported anything is behind, not up to date: it is
# either new or old, and both want the offer.
link.panel(V2).stats = {"firmware": {"running": "v2026.9.60"}}
link.panel(V1).stats = None
check("inkplate5v1" in main._models_behind(), "a panel that has said nothing yet is offered one too")

# And the answer is republished when a panel changes rather than only at
# startup: this is what makes switching a panel on enough.
main._offer_fingerprint = None
check(main._offers_would_change(), "the first look after a change says so")
check(not main._offers_would_change(), "and the second does not, so a quiet panel costs no publishes")
link.panel(V1).stats = {"firmware": {"running": "v2026.9.60"}}
check(main._offers_would_change(), "a panel reporting a new version says so again")


print("--- a screenshot is the size of the panel that sent it ---")
#
# reports.py had one pair of dimensions, the V2's, so the smaller panel's
# framebuffer was refused as a truncated upload every time it was asked for a
# picture: "Expected 115200 bytes, got 64800". Both sizes are plausible numbers,
# which is why the message now names the panel.

import reports  # noqa: E402

check(reports.frame_bytes(V2) == 1280 // 8 * 720, f"the V2's frame is {reports.frame_bytes(V2)} bytes")
check(reports.frame_bytes(V1) == 960 // 8 * 540, f"the V1's is {reports.frame_bytes(V1)}, which is not the same number")

for panel, size in ((V2, (1280, 720)), (V1, (960, 540))):
    meta = reports.save_screenshot(panel, bytes(size[0] // 8 * size[1]), rotation=0)
    check(
        (meta["width"], meta["height"]) == size,
        f"{panel} stores a {meta['width']}x{meta['height']} picture",
    )

# And the wrong size is still refused, which is the thing the length check is
# for: a truncated upload rather than a smaller panel.
try:
    reports.save_screenshot(V1, bytes(1280 // 8 * 720))
    refused = False
except ValueError as problem:
    refused = V1 in str(problem)
check(refused, "the other panel's frame sent to this one is refused, by name")


print("--- naming a panel ---")

renamed = editor.patch(f"/api/panels/{V1}", json={"name": "  Bench  panel "}).json()
check(renamed["name"] == "Bench panel", f"a name is tidied rather than taken raw ({renamed['name']})")
check(panels.get(V1)["name"] == "Bench panel", "and kept")
check(
    store.load(V1).get("name") == "Bench panel",
    "the layout carries it, so the panel can show it on its own info screen",
)
check(
    editor.patch(f"/api/panels/{V1}", json={"name": ""}).json()["name"]
    == "Inkplate 5 64a012",
    "clearing it goes back to the derived name rather than to nothing",
)
check(editor.patch("/api/panels/nobody", json={"name": "x"}).status_code == 404,
      "renaming a panel that does not exist is a 404")


print("--- forgetting a panel keeps its dashboard ---")

check(editor.delete(f"/api/panels/{V1}").json()["ok"], "a panel can be dropped from the list")
check(len(editor.get("/api/panels").json()["panels"]) == 1, "and goes")
check(
    os.path.isfile(store.layout_path(V1)),
    "but its layout stays on disk -- unplugged for a fortnight looks the same as gone",
)
panels.seen(V1, "inkplate5v1")
check(
    editor.get(f"/api/layout?panel={V1}").json()["pages"][0]["name"] == "Bench",
    "so a panel that comes back still has its pages",
)


print("--- the album refresh asks for each panel's own picture sizes ---")
#
# Twice now a fault has hidden in the seam between a module and the code that
# calls it: the module's own harness passed, and production passed it something
# else. Here albums.refresh() was changed to take (grid, layout) pairs and
# main kept handing it bare layouts, so *every* refresh raised and nothing was
# rendered -- which shows up on the panel as ALBUM IS EMPTY, and only on the
# panel asking for a size nobody had rendered before. So this drives main's own
# function rather than albums'.

import albums  # noqa: E402

for pid in (V2, V1):
    store.save(pid, {
        "version": 1,
        "pages": [{"id": "p", "name": "P", "chip_row": "bottom", "widgets": [
            {"id": "w", "type": "photo", "size": "3x2", "x": 20, "y": 20,
             "options": {"album": "demo"}}]}],
    })

pairs = main._every_layout()
check(
    all(isinstance(one, tuple) and len(one) == 2 for one in pairs),
    "every layout comes with the grid it is drawn against",
)

wanted = {one.prefix for one in albums.variants_in_all(pairs)}
# Two panels, two shapes each: four pictures of the one photo widget. A panel
# that can be turned needs the sideways sizes rendered *before* it is turned,
# or it draws ALBUM IS EMPTY until the next refresh comes round.
check(
    len(wanted) == 4,
    f"two panels that each stand two ways want four pictures ({sorted(wanted)})",
)
check(
    len({p for p in wanted if p.startswith("demo_704x374")}) == 1,
    "the V2 upright is among them",
)
check(
    not albums.starved(pairs) or True,
    "and starved() takes the same shape without raising",
)


print("--- an install from before any of this ---")
#
# One layout.json, one manifest.json, no panel in either name. The first panel
# to ask inherits them, or an existing dashboard would look deleted.

shutil.rmtree(DATA, ignore_errors=True)
os.makedirs(DATA, exist_ok=True)
panels._read.cache_clear() if hasattr(panels._read, "cache_clear") else None

legacy = {
    "version": 7,
    "pages": [{"id": "main", "name": "The one I had", "widgets": [], "chip_row": "bottom"}],
}
with open(os.path.join(DATA, "layout.json"), "w", encoding="utf-8") as handle:
    json.dump(legacy, handle)

first = store.load(V2)
check(first["pages"][0]["name"] == "The one I had", "the first panel to ask inherits the layout")
check(first.get("version") == 7, "with its version, so the push state still means something")
check(
    store.load(V1)["pages"][0]["name"] != "The one I had",
    "the second panel does not inherit it as well",
)
check(
    os.path.isfile(os.path.join(DATA, "layout.json")),
    "the old file is left where it is rather than moved, so a rollback still finds it",
)

print("--- the layout says which grid it was drawn against ---")
#
# A layout is a list of pixel positions, and a pixel means nothing without the
# grid it was placed on. The firmware reads that back under `laid_out_for` and
# assumes the V2's when it is missing -- which was every layout this add-on had
# ever sent, because this half was never built. The V1 therefore re-mapped its
# *own* layout as though it were the V2's, scaling every position across the
# difference between the panels.
#
# Cards survived it: they are re-placed by cell and land back on the cell they
# started on. Chips are placed to the pixel, so a chip put hard against the
# right margin in the editor arrived a quarter of the panel short of it --
# reported from the device, twice, before this was found.

# Re-posted here rather than relied on from earlier: a later section forgets a
# panel, and a check that reads "this panel's own grid" against a grids.of()
# that has quietly fallen back to the V2's is a check that passes while the
# thing it describes is broken. It did, on the first run of this section.
device.post(
    "/device/manifest",
    content=json.dumps(
        manifest_for(
            V1,
            "inkplate5v1",
            {"gap": 26, "gap_x": 26, "gap_y": 32, "margin_x": 21, "margin_y": 38,
             "unit_w": 210, "unit_h": 172, "unit_h_off": 172, "cols": 4, "rows": 2, "chip_h": 56},
            {"width": 960, "height": 540},
        )
    ).encode(),
)
check(grids.of(V1).unit_h == 172 and grids.of(V1).gap_x == 26,
      "the V1's manifest is in place for this section")

published = []
link._publish = lambda topic, payload, retain=False: (
    published.append((topic, json.loads(payload))) or True
)

layout = {"version": 3, "pages": [{"id": "main", "name": "Main", "widgets": []}]}

check(link.publish_layout(V1, layout), "a layout is published to the V1")
topic, sent = published[-1]
declared = sent.get("laid_out_for")
check(declared is not None, "and it carries laid_out_for")
check(
    declared == grids.of(V1).as_laid_out_for(),
    f"which is that panel's own grid ({declared})",
)
check(
    declared["width"] == 960 and declared["gap_x"] == 26,
    "the V1's numbers, not the V2's -- the whole point of sending it",
)

check(link.publish_layout(V2, layout), "and one to the V2")
declared_v2 = published[-1][1]["laid_out_for"]
check(declared_v2["width"] == 1280 and declared_v2["unit_w"] == 210, "which carries the V2's")
check(declared_v2 != declared, "so the two panels are told different things")

# Both shapes, because a page keeps an arrangement for each and each was drawn
# against its own grid. Sending only the shape the panel happens to be standing
# in now would leave the other arrangement described by the wrong grid -- and
# the panel can be turned from its own menu long after this was sent.
sideways = sent.get("laid_out_for_portrait")
check(sideways is not None, "and a grid for the sideways arrangement as well")
check(
    sideways and sideways["height"] > sideways["width"],
    f"which is the taller shape ({sideways['width']}x{sideways['height']})",
)
check(
    sideways and sideways["unit_w"] == declared["unit_w"]
    and sideways["unit_h"] == declared["unit_h"],
    "sharing the cell with the upright one, which is the whole arrangement",
)
check(
    sideways and (sideways["gap_x"], sideways["margin_x"])
    != (declared["gap_x"], declared["margin_x"]),
    "but not its gaps: no cell divides both shapes, so each keeps its own",
)

check("laid_out_for" not in layout, "the caller's layout is not modified on the way past")
check(
    sent["pages"] == layout["pages"] and sent["version"] == 3,
    "and everything else is passed through untouched",
)

# A panel that has never sent a manifest falls back to the V2's grid, which is
# what was assumed before any of this existed -- so an old install cannot be
# made worse by starting to send the block.
check(link.publish_layout("inkplate-nobody", layout), "a panel with no manifest still gets a layout")
check(
    published[-1][1]["laid_out_for"]["width"] == 1280,
    "stamped with the V2's grid, which is what was assumed before this was sent at all",
)


print(f"\n{passes + failures} checks, " + ("all panel checks passed" if not failures else f"{failures} FAILED"))
sys.exit(1 if failures else 0)
