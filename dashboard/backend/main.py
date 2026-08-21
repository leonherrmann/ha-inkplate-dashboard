"""FastAPI app: serves the editor and exposes the device to it."""

import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any

import aiohttp
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import firmware
import images
import store
from ha_bridge import bridge
from history import history
from mqtt import link
import timezone
from registry import registry
from weather import weather
from settings import (
    DEVICE_PORT,
    FIRMWARE_REPO,
    HA_REST_URL,
    IMAGE_BASE_URL,
    LOG_LEVEL,
    STATIC_DIR,
    SUPERVISOR_TOKEN,
    DEVICE_ID,
)

logging.basicConfig(level=LOG_LEVEL, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("inkplate")


async def _host_address() -> str:
    """The host's own address, for telling the device where to fetch images.

    The add-on's container address is on Home Assistant's internal network and
    means nothing to the Inkplate, so ask the Supervisor for the real one.
    """
    if not SUPERVISOR_TOKEN:
        return ""
    headers = {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}
    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get("http://supervisor/network/info", timeout=5) as response:
                response.raise_for_status()
                payload = await response.json()
    except Exception as error:
        log.warning("Could not ask the Supervisor for the host address: %s", error)
        return ""

    for interface in payload.get("data", {}).get("interfaces", []):
        if not interface.get("primary"):
            continue
        for address in interface.get("ipv4", {}).get("address", []):
            return str(address).split("/")[0]
    return ""


async def image_base_url() -> str:
    if IMAGE_BASE_URL:
        return IMAGE_BASE_URL
    host = await _host_address()
    return f"http://{host}:{DEVICE_PORT}" if host else ""


async def publish_firmware() -> None:
    """Tell the device what build is on offer, and where to fetch it."""
    base = await image_base_url()
    link.publish_firmware(firmware.store.manifest(base))


async def publish_images() -> None:
    """Republish the image manifest. Called whenever the set changes."""
    base = await image_base_url()
    if not base:
        log.warning(
            "No image base URL: the device will not be able to fetch images. "
            "Set the image_base_url add-on option to http://<your-ha-ip>:%d",
            DEVICE_PORT,
        )
    link.publish_images(images.manifest(base))


@asynccontextmanager
async def lifespan(app: FastAPI):
    link.start()
    bridge.start()
    weather.start()
    # Follow whatever the stored layout already references, so a restart of the
    # add-on keeps feeding the device without waiting for a push.
    entities = store.entity_ids(store.load())
    bridge.follow(entities)
    weather.follow(entities)
    # The device may have booted while the add-on was down, so re-advertise what
    # is available rather than waiting for the next upload.
    await publish_images()
    firmware.store.start(publish_firmware)
    await publish_firmware()
    yield
    await firmware.store.stop()
    await weather.stop()
    await bridge.stop()
    link.stop()


app = FastAPI(title="Inkplate Dashboard", lifespan=lifespan)


def _push_state(layout: dict[str, Any]) -> tuple[bool, int | None]:
    """Whether the draft still matches what went out, and which version that was.

    Answered here rather than in the browser so the digest is never recomputed,
    or reimplemented, on the other side of the wire.
    """
    last = store.pushed()
    if last:
        return last.get("digest") == store.fingerprint(layout), last.get("version")

    # No record kept: either nothing has ever been pushed from this install, or
    # it predates the record being kept at all. The device's own echo is the
    # evidence that settles it -- a panel reporting this very version was sent
    # it, whether or not anything wrote that down at the time.
    applied = link.applied or {}
    version = layout.get("version", 0)
    if applied.get("version") == version and applied.get("ok") is not False:
        return True, version
    return False, None


@app.get("/api/status")
async def get_status() -> dict[str, Any]:
    layout = store.load()
    draft_pushed, pushed_version = _push_state(layout)
    return {
        "device_id": DEVICE_ID,
        "online": link.online,
        "manifest": link.manifest,
        "applied": link.applied,
        "stats": link.stats,
        "charging": link.charging,
        "current_page": link.current_page,
        "last_seen": link.last_seen,
        "server_time": time.time(),
        "draft_version": layout.get("version", 0),
        "pushed_version": pushed_version,
        "draft_pushed": draft_pushed,
        "bridge_enabled": bool(SUPERVISOR_TOKEN),
    }


@app.get("/api/history")
async def get_history() -> dict[str, Any]:
    """Voltage and availability samples for the Device panel's sparkline."""
    return {"samples": history.samples()}


@app.get("/api/manifest")
async def get_manifest() -> dict[str, Any]:
    if not link.manifest:
        raise HTTPException(
            status_code=503,
            detail=(
                "No manifest received yet. The device publishes it at boot, "
                "so power it on and make sure it reaches the same MQTT broker."
            ),
        )
    return link.manifest


@app.get("/api/layout")
async def get_layout() -> dict[str, Any]:
    return store.load()


@app.put("/api/layout")
async def put_layout(layout: dict[str, Any]) -> dict[str, Any]:
    store.save(layout)
    return {"ok": True}


@app.post("/api/push")
async def push_layout() -> dict[str, Any]:
    layout = store.load()
    layout["version"] = int(layout.get("version", 0)) + 1

    # The device has no tzdata, so it is told Home Assistant's zone as a POSIX
    # string. Sent with every push so a DST rule change cannot leave it stale.
    layout["timezone"] = timezone.to_posix(registry.time_zone)

    store.save(layout)

    sent = link.publish_layout(layout)
    # Only a push that reached the broker counts as sent. Recording one that did
    # not would leave the editor claiming to be waiting on the device, when what
    # it is really waiting on is its own connection.
    if sent:
        store.record_pushed(layout)
    # The device only needs the entities this layout actually names
    entities = store.entity_ids(layout)
    bridge.follow(entities)
    weather.follow(entities)

    return {"ok": sent, "version": layout["version"]}


@app.post("/api/refresh")
async def refresh_device() -> dict[str, Any]:
    link.publish_command("refresh")
    return {"ok": True}


@app.post("/api/page/{page_id}")
async def show_page(page_id: str) -> dict[str, Any]:
    """Put a specific page up now. The device still rotates on from it."""
    link.publish_command("page", page=page_id)
    return {"ok": True}


@app.get("/api/images")
async def get_images() -> dict[str, Any]:
    """What has been uploaded, plus what the device reports having of it.

    The device names the images on its card in its stats, so each one can be
    marked rather than showing only a total.
    """
    reported = (link.stats or {}).get("images") or {}
    return {
        "images": images.listing(),
        "base_url": await image_base_url(),
        "device": reported,
        # Absent on firmware older than the image support, which is different
        # from a device that has nothing
        "device_reports": bool(reported),
    }


@app.post("/api/images")
async def post_image(
    file: UploadFile = File(...),
    name: str = Form(""),
    mode: str = Form("photo"),
    width: int = Form(0),
    height: int = Form(0),
) -> dict[str, Any]:
    """Convert and store an upload, then tell the device about it.

    "exact" keeps the image's own pixel size and only thresholds it, for art
    drawn to match the UI. "photo" crops to fill width x height and dithers.
    """
    try:
        entry = images.store(name or file.filename or "image", await file.read(), mode, width, height)
    except images.ImageError as error:
        raise HTTPException(status_code=400, detail=str(error))

    await publish_images()
    return entry


@app.delete("/api/images/{name}")
async def delete_image(name: str) -> dict[str, Any]:
    if not images.remove(name):
        raise HTTPException(status_code=404, detail="No such image")
    await publish_images()
    return {"ok": True}


@app.get("/api/images/{name}/preview.png")
async def get_image_preview(name: str) -> FileResponse:
    """The dithered result, so the editor shows what the panel will show."""
    path = images.preview_path(name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="No such image")
    return FileResponse(path, media_type="image/png")


@app.get("/api/firmware")
async def get_firmware() -> dict[str, Any]:
    """What is held here, and what the device says it is running."""
    reported = (link.stats or {}).get("firmware") or {}
    return {
        "repo": FIRMWARE_REPO,
        "held": firmware.store.state,
        "device": reported,
        "servable": bool(firmware.store.have_binary() and await image_base_url()),
    }


@app.post("/api/firmware/check")
async def check_firmware() -> dict[str, Any]:
    """Ask GitHub now rather than waiting for the next poll."""
    if not FIRMWARE_REPO:
        raise HTTPException(status_code=400, detail="No firmware repo configured")
    try:
        changed = await firmware.store.check()
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Could not reach GitHub: {error}")
    if changed:
        await publish_firmware()
    return {"ok": True, "changed": changed, "held": firmware.store.state}


@app.post("/api/firmware/update")
async def update_firmware() -> dict[str, Any]:
    """Tell the device to fetch and install what is on offer."""
    if not firmware.store.have_binary():
        raise HTTPException(status_code=400, detail="No firmware held to install")
    # Republished first, so the device is certainly holding the current offer
    await publish_firmware()
    link.publish_command("update")
    return {"ok": True, "version": firmware.store.state.get("version")}


@app.get("/api/entities")
async def get_entities() -> list[dict[str, str]]:
    """Entities for the editor's pickers, annotated with domain and area."""
    if not SUPERVISOR_TOKEN:
        return []
    headers = {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}
    async with aiohttp.ClientSession(headers=headers) as session:
        async with session.get(f"{HA_REST_URL}/states") as response:
            response.raise_for_status()
            states = await response.json()

    return await registry.entities(states)


# The built editor is mounted last so it does not shadow /api. Ingress serves the
# add-on under a path prefix, which is why the frontend uses relative URLs.
if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/")
    async def index() -> FileResponse:
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
