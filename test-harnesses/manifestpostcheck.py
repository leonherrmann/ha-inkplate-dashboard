"""The manifest's HTTP route, and the store both transports write through.

The panel POSTs its capability manifest to the device port now instead of
publishing 15KB in one MQTT packet, which is more than its WiFi can reliably
push. This checks the receiving end: that a real manifest is accepted and
readable back, that rubbish is refused rather than stored, and that the MQTT
path and the HTTP path land in the same place.

Run from dashboard/backend with a python3.13 venv -- the python3 on PATH is
miniconda 3.8 and cannot parse this backend:

    cd dashboard/backend
    PYTHONPATH=. DATA_DIR=/tmp/inkdata-test /tmp/ink-venv/bin/python \
        ../../test-harnesses/manifestpostcheck.py
"""

import json
import os
import shutil
import sys

DATA = os.environ.setdefault("DATA_DIR", "/tmp/inkdata-manifestcheck")
shutil.rmtree(DATA, ignore_errors=True)
os.makedirs(DATA, exist_ok=True)

from fastapi.testclient import TestClient  # noqa: E402

import manifest_store  # noqa: E402
import panels  # noqa: E402
from device_api import app  # noqa: E402

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


HERE = os.path.dirname(os.path.abspath(__file__))
# The firmware's own manifest, dumped with ./sim/preview --manifest. A
# hand-written one would be testing a widget set that does not exist.
with open(os.path.join(HERE, "manifest.json"), encoding="utf-8") as handle:
    REAL = json.load(handle)

# Which panel it says it came from. Firmware new enough to be managed alongside
# others puts its id in the document; the fixture may predate that, in which
# case the route is told by query string instead.
PANEL = (REAL.get("device") or {}).get("id") or "inkplate-a864a0"
QUERY = f"?device={PANEL}"

client = TestClient(app)

# --- nothing stored yet -----------------------------------------------------

check(
    manifest_store.load(PANEL) is None,
    "with nothing posted the store answers None, not an empty palette",
)

# --- the real thing ---------------------------------------------------------

body = json.dumps(REAL, separators=(",", ":")).encode()
response = client.post("/device/manifest" + QUERY, content=body)
check(response.status_code == 200, f"a real manifest is accepted ({response.status_code})")
check(
    response.json().get("device") == PANEL,
    "and the reply says which panel it was filed under",
)
check(
    any(panel["id"] == PANEL for panel in panels.all()),
    "a manifest is enough for the panel to appear in the device list",
)
check(
    response.json().get("widgets") == len(REAL["widgets"]),
    f"and the reply counts the widget types it understood ({response.json().get('widgets')})",
)

stored = manifest_store.load(PANEL)
check(stored == REAL, "reading it back gives exactly what was sent")
check(
    os.path.isfile(manifest_store.path(PANEL))
    and not os.path.exists(manifest_store.path(PANEL) + ".part"),
    "written atomically, with no .part left behind",
)

# The shared value lists have to survive the round trip, or the editor resolves
# values_ref against nothing and every icon dropdown is empty.
check(
    stored.get("values") and all(
        isinstance(one, list) for one in stored["values"].values()
    ),
    f"the shared value lists survive ({len(stored.get('values') or {})} of them)",
)
refs = [
    option["values_ref"]
    for widget in stored["widgets"]
    for option in widget.get("options", [])
    if "values_ref" in option
]
check(refs and all(ref in stored["values"] for ref in refs),
      f"and every values_ref still resolves ({len(refs)} references)")

# --- rubbish is refused, and does not replace what is held -------------------

for body, why in [
    (b"", "an empty body"),
    (b"not json at all", "something that is not JSON"),
    (b"[1,2,3]", "a JSON array rather than an object"),
    (b'{"display":{}}', "an object with no widgets"),
    (b'{"widgets":[]}', "an object whose widget list is empty"),
]:
    response = client.post("/device/manifest" + QUERY, content=body)
    check(response.status_code == 400, f"{why} is refused ({response.status_code})")

check(
    manifest_store.load(PANEL) == REAL, "and none of those replaced the manifest already held"
)

# Bounded, because this route is unauthenticated like the rest of the device port
response = client.post(
    "/device/manifest" + QUERY, content=b"{" + b" " * (manifest_store.MAX_BYTES + 10)
)
check(response.status_code == 400, "an oversized body is refused rather than parsed")

# --- the MQTT path lands in the same place ----------------------------------

older = {"display": {"width": 1280, "height": 720}, "widgets": [{"type": "clock", "label": "Clock"}]}
manifest_store.save(json.dumps(older), PANEL)
check(
    manifest_store.load(PANEL) == older,
    "a manifest arriving on MQTT replaces the stored one, so the two cannot disagree",
)

# mtime caching must not serve a stale answer after a write
manifest_store.save(json.dumps(REAL), PANEL)
check(
    manifest_store.load(PANEL) == REAL,
    "and the mtime cache does not serve the previous one afterwards",
)

# --- a second panel keeps its own ------------------------------------------
#
# The fault this exists for: one stored manifest meant whichever panel booted
# last retuned the editor's grid for every panel, and a V1 next to a V2 did
# exactly that.

OTHER = "inkplate-000001"
small = {
    "device": {"id": OTHER, "model": "inkplate5v1"},
    "display": {"width": 960, "height": 540, "model": "inkplate5v1"},
    "grid": {"gap": 20, "unit_w": 215, "unit_h": 202, "cols": 4, "rows": 2},
    "widgets": [{"type": "clock", "label": "Clock"}],
}
response = client.post("/device/manifest", content=json.dumps(small).encode())
check(response.status_code == 200, "a second panel posts its own manifest")
check(
    response.json().get("device") == OTHER,
    "filed under the id in the document, not under the first panel's",
)
check(manifest_store.load(OTHER) == small, "the second panel reads back its own")
check(manifest_store.load(PANEL) == REAL, "and the first panel's is untouched")

import grids  # noqa: E402

check(grids.of(OTHER).cols == 4, f"its grid is its own ({grids.of(OTHER).cols} columns)")
check(grids.of(PANEL).cols == 5, f"and so is the first panel's ({grids.of(PANEL).cols})")

# --- the address the panel is given ------------------------------------------
#
# Not about the manifest's *contents* but about whether the panel can reach the
# route at all, which is the same question. The firmware's HTTP client wants
# `http://host:port` exactly and refuses anything else, and what goes into the
# add-on option is an address as a person writes one. Found on a real install:
# a bare `192.168.178.35` meant no images, no boot log, and a manifest falling
# back to one 15KB MQTT publish -- the thing HTTP is there to avoid.

import settings  # noqa: E402

for raw, wanted, why in [
    ("192.168.178.35", "http://192.168.178.35:8098", "a bare address gets a scheme and the device port"),
    ("http://192.168.178.35", "http://192.168.178.35:8098", "a scheme without a port gets the port"),
    ("http://192.168.178.35:8098", "http://192.168.178.35:8098", "a good one is left exactly alone"),
    ("http://ha.local:8098/", "http://ha.local:8098", "a trailing slash goes, since every caller appends one"),
    ("https://dash.example.com", "https://dash.example.com", "https is somebody's reverse proxy; adding 8098 would break it"),
    ("  10.0.0.5  ", "http://10.0.0.5:8098", "and it is not upset by spaces"),
    ("", "", "empty stays empty, which means ask the Supervisor"),
]:
    got = settings._usable_base_url(raw)
    check(got == wanted, f"{why} ({raw!r} -> {got!r})")

print(f"\n{passes + failures} checks, " + ("all manifest post checks passed" if not failures else f"{failures} FAILED"))
sys.exit(1 if failures else 0)
