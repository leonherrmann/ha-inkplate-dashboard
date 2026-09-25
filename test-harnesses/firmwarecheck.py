"""Over-the-air updates with two boards on one broker.

The firmware is one source tree compiled for two panels, and **the images are
not interchangeable**: an Inkplate 5 V2 image on a V1 drives a framebuffer of
the wrong size and is recoverable only over USB. So a release carries a binary
per model, the add-on holds each one, and every panel is offered the one built
for it -- an arrangement with several places to get it quietly wrong, each of
which ends in a panel that either cannot update or updates into a brick.

This drives the whole path with a faked GitHub: the release listing, the asset
download, what ends up on disk, and what each panel is then offered.

Run from dashboard/backend with a python3.13 venv -- the python3 on PATH is
miniconda 3.8 and cannot parse this backend:

    cd dashboard/backend
    PYTHONPATH=. /tmp/ink-venv/bin/python ../../test-harnesses/firmwarecheck.py
"""

import asyncio
import hashlib
import json
import os
import shutil
import sys

DATA = os.environ.setdefault("DATA_DIR", "/tmp/inkdata-firmwarecheck")
shutil.rmtree(DATA, ignore_errors=True)
os.makedirs(DATA, exist_ok=True)
os.environ.setdefault("FIRMWARE_REPO", "leon/inkplate")

from fastapi.testclient import TestClient  # noqa: E402

import firmware  # noqa: E402
import panels  # noqa: E402
from device_api import app as device_app  # noqa: E402
LEGACY = firmware.LEGACY_MODEL

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


V2_IMAGE = b"V2" + b"\x00" * 4000
V1_IMAGE = b"V1" + b"\xff" * 3000

# --- a GitHub that answers with whatever the case under test wants -----------

RELEASE = {}


class _Response:
    def __init__(self, payload):
        self._payload = payload
        self.status = 200

    async def __aenter__(self):
        return self

    async def __aexit__(self, *rest):
        return False

    def raise_for_status(self):
        pass

    async def json(self):
        return RELEASE


class _Session:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *rest):
        return False

    def get(self, url, **kwargs):
        return _Response(RELEASE)


firmware.aiohttp.ClientSession = lambda **kwargs: _Session()

# The bytes are faked at the download rather than the transport: what is being
# checked here is which asset is fetched for which model, not how a redirect to
# GitHub's storage is followed.
BODIES = {}


async def fake_download(session, asset):
    return BODIES[asset["name"]]


firmware.FirmwareStore._download_asset = staticmethod(fake_download)


def release(version, assets):
    global RELEASE
    RELEASE = {
        "tag_name": version,
        "body": "notes",
        "published_at": "2026-09-19T00:00:00Z",
        "assets": [
            {"name": name, "size": len(body), "browser_download_url": f"https://x/{name}", "url": f"https://api/{name}"}
            for name, body in assets
        ],
    }
    BODIES.clear()
    BODIES.update(dict(assets))


print("--- reading the model out of an asset name ---")

for name, wanted in [
    ("ha_dashboard-inkplate5v2.bin", "inkplate5v2"),
    ("ha_dashboard-inkplate5v1.bin", "inkplate5v1"),
    ("ha_dashboard_inkplate5v2.bin", "inkplate5v2"),
    ("inkplate5v1.bin", "inkplate5v1"),
    ("ha_dashboard.ino.bin", None),
    ("notes.txt", None),
]:
    got = firmware.model_in(name)
    check(got == wanted, f"{name} -> {got}")


print("--- a release with a binary per board ---")

store = firmware.FirmwareStore()
release("v2026.9.60", [("ha_dashboard-inkplate5v2.bin", V2_IMAGE), ("ha_dashboard-inkplate5v1.bin", V1_IMAGE)])
check(asyncio.run(store.check()), "it is taken as new")
check(store.state["version"] == "v2026.9.60", "the version is the tag")
check(sorted(store.models()) == ["inkplate5v1", "inkplate5v2"], "both builds are held")
check(
    open(store.binary_path("inkplate5v2"), "rb").read() == V2_IMAGE
    and open(store.binary_path("inkplate5v1"), "rb").read() == V1_IMAGE,
    "each file is the image built for that board, not the other one",
)
check(
    store.state["builds"]["inkplate5v1"]["sha256"] == hashlib.sha256(V1_IMAGE).hexdigest(),
    "with the hash the panel checks before making it bootable",
)
check(not asyncio.run(store.check()), "and a second poll of the same release downloads nothing")


print("--- what each panel is offered ---")

BASE = "http://192.168.178.35:8098"
v2 = store.manifest(BASE, "inkplate5v2")
v1 = store.manifest(BASE, "inkplate5v1")

check(v2["model"] == "inkplate5v2" and v1["model"] == "inkplate5v1", "each offer names its own board")
check(v2["url"].endswith("/firmware-inkplate5v2.bin"), f"and its own URL ({v2['url']})")
check(v1["url"] != v2["url"], "which is a different URL from the other panel's")
check(
    v1["sha256"] == hashlib.sha256(V1_IMAGE).hexdigest() and v1["bytes"] == len(V1_IMAGE),
    "carrying that build's size and hash",
)
check(v1["version"] == v2["version"] == "v2026.9.60", "one release, one version, two builds")
check(store.manifest(BASE, "inkplate6") == {}, "a board with no build in this release is offered nothing")
check(store.manifest("", "inkplate5v2") == {}, "and nothing at all without an address to fetch from")


print("--- the device port serves them apart ---")

client = TestClient(device_app)
check(client.get("/firmware-inkplate5v2.bin").content == V2_IMAGE, "a V2 asks for and gets the V2 image")
check(client.get("/firmware-inkplate5v1.bin").content == V1_IMAGE, "a V1 gets the V1 image")
check(client.get("/firmware-inkplate6.bin").status_code == 404, "a board with no build gets a 404, not somebody else's image")
check(
    client.get("/firmware.bin").content == (V2_IMAGE if LEGACY == "inkplate5v2" else V1_IMAGE),
    "and the old unversioned path still serves the board those releases were for",
)


print("--- a release from before there were two boards ---")

shutil.rmtree(os.path.join(DATA, "firmware"), ignore_errors=True)
legacy = firmware.FirmwareStore()
release("v2026.9.44", [("ha_dashboard.ino.bin", V2_IMAGE)])
check(asyncio.run(legacy.check()), "is still taken")
check(
    legacy.models() == [LEGACY],
    f"and filed under the board those releases were built for ({LEGACY})",
)
check(legacy.manifest(BASE, LEGACY).get("version") == "v2026.9.44", "so that panel is still offered it")
check(
    legacy.manifest(BASE, "inkplate5v1") == {} or LEGACY == "inkplate5v1",
    "and the other board is offered nothing rather than an image that would brick it",
)


print("--- which board the one shared offer carries ---")
#
# There is a single legacy topic, it can name one model, and firmware old
# enough to read only that topic *clears* an offer whose model is not its own.
# So this is not a preference, it is who gets to be updated -- and it used to be
# an add-on option, which meant the answer was whatever somebody typed once.

for behind, wanted, why in [
    ([], LEGACY, "nobody behind: the legacy board, for a panel that arrives on old firmware"),
    ([LEGACY], LEGACY, "a legacy panel is behind: it keeps the topic"),
    (["inkplate5v1"], "inkplate5v1", "only the other board is behind: the topic is handed to it"),
    ([LEGACY, "inkplate5v1"], LEGACY, "both behind: the legacy board, which is the only one that can need this topic"),
    (["inkplate5v1", "inkplate5v1"], "inkplate5v1", "two panels of the other board, still one answer"),
]:
    got = store.shared_model(behind)
    check(got == wanted, f"{why} ({behind or 'none'} -> {got})")

# The case that started this: a V1 that cannot see its own topic, beside a V2
# that is already up to date, gets the shared one without anybody configuring
# anything.
release("v2026.9.60", [("ha_dashboard-inkplate5v2.bin", V2_IMAGE), ("ha_dashboard-inkplate5v1.bin", V1_IMAGE)])
# Both builds back on disk: the legacy case above deleted them.
asyncio.run(store.check())
offer = store.manifest(BASE, store.shared_model(["inkplate5v1"]))
check(offer["model"] == "inkplate5v1", "so the shared offer names the V1")
check(offer["url"].endswith("firmware-inkplate5v1.bin"), "and points at the V1 image")


print("--- a release with nothing usable ---")

shutil.rmtree(os.path.join(DATA, "firmware"), ignore_errors=True)
empty = firmware.FirmwareStore()
release("v2026.9.61", [("notes.txt", b"hello")])
check(not asyncio.run(empty.check()), "is refused")
check("no .bin" in (empty.state.get("error") or ""), f"with a reason ({empty.state.get('error')})")

print(f"\n{passes + failures} checks, " + ("all firmware checks passed" if not failures else f"{failures} FAILED"))
sys.exit(1 if failures else 0)
