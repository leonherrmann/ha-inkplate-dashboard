"""FastAPI app: serves the editor and exposes the device to it."""

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any

import aiohttp
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import albums
import firmware
import ha_timer
import icloud
import images
import reports
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
    # A newly found release is what the update entity in Home Assistant exists
    # to report, so it hears about it at the same moment the device does.
    link.announce()


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


# How often to ask iCloud whether an album has changed.
#
# Six hours, not minutes: a shared album is something people add holiday photos
# to, not a feed, and every refresh that does find something new spends seconds
# per picture dithering it. The Refresh button in the Images tab is there for
# when someone has just added one and does not want to wait.
ALBUM_POLL_SECONDS = 6 * 3600

# Long enough after start-up that the first poll does not compete with the
# device's boot, the entity discovery and the firmware check for the same CPU.
ALBUM_FIRST_POLL_SECONDS = 120


async def refresh_albums(layout: dict[str, Any] | None = None) -> dict[str, Any]:
    """Bring the albums' pictures into line with the layout, then tell the device.

    The layout is the draft rather than what was pushed, deliberately: someone
    who has just dropped a photo widget on a page wants its pictures rendered
    before they push, not after.

    `layout` is passed in by the one caller that already has it -- saving an
    edit -- rather than re-read from disk. Re-reading raced the save that had
    just happened and could come back empty, which is how an album's pictures
    were once deleted for a layout that did have a photo widget in it.
    """
    return await albums.refresh(
        store.load() if layout is None else layout, on_change=publish_images
    )


# How soon to come back when a photo widget has no pictures at all. Six hours is
# the right cadence for "has anything been added to the album", and far too slow
# for "this widget is showing ALBUM IS EMPTY and only a render will fix it".
ALBUM_RETRY_SECONDS = 600


async def poll_albums() -> None:
    """Re-read every configured album on a slow timer.

    Faster while any widget is starved, because that is a panel with a blank
    card on it rather than a panel that is merely a few hours out of date.
    """
    await asyncio.sleep(ALBUM_FIRST_POLL_SECONDS)
    while True:
        try:
            await refresh_albums()
        except asyncio.CancelledError:
            raise
        except Exception:
            # Same reasoning as the screenshot watcher: a poller that dies takes
            # the albums with it silently, and the symptom would be photos that
            # quietly stopped updating weeks later.
            log.exception("Album poll stumbled")

        wait = ALBUM_POLL_SECONDS
        try:
            starving = albums.starved(store.load())
            if starving:
                log.warning(
                    "These photo widgets have no pictures yet: %s. Trying again in %d "
                    "minutes rather than waiting for the next full poll.",
                    ", ".join(starving), ALBUM_RETRY_SECONDS // 60,
                )
                wait = ALBUM_RETRY_SECONDS
        except Exception:
            log.exception("Could not work out whether any album is starved")

        await asyncio.sleep(wait)


async def watch_screenshots() -> None:
    """Tell Home Assistant when a new screenshot has arrived.

    The device uploads to the other uvicorn process, which shares nothing with
    this one but the data directory -- so the file's timestamp is the signal.
    Polled rather than watched: this is one stat() every few seconds against a
    picture that is only ever taken on request.

    The URL carries the capture time as a query, which is what makes it a *new*
    URL. Without it Home Assistant is being handed the same string it already
    has, and whether that counts as a change is its business rather than ours.
    """
    last: float | None = None
    while True:
        try:
            held = reports.screenshot()
            taken = held.get("taken_at") if held else None
            if taken and taken != last:
                base = await image_base_url()
                if base:
                    link.publish_screenshot(f"{base}/device/screenshot.png?t={int(taken)}")
                    log.info("Published a new screenshot to Home Assistant")
                last = taken
        except asyncio.CancelledError:
            raise
        except Exception:
            # A watcher that dies takes the image entity with it, silently, and
            # the fault would show up as "screenshots stopped working" weeks
            # later. Log it and keep going.
            log.exception("Screenshot watcher stumbled")
        await asyncio.sleep(3)


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

    # The helper that mirrors the panel's timer. It is handed a way to command
    # the device, because a change made in Home Assistant has to reach the
    # panel that actually owns the timer.
    ha_timer.mirror.start(
        lambda command: link.publish_command(
            command.pop("action"), **command
        )
    )
    await publish_firmware()
    watcher = asyncio.create_task(watch_screenshots())
    albums_poller = asyncio.create_task(poll_albums())
    yield
    albums_poller.cancel()
    watcher.cancel()
    await firmware.store.stop()
    await ha_timer.mirror.stop()
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
        "page_locked": link.page_locked,
        "last_seen": link.last_seen,
        "server_time": time.time(),
        "draft_version": layout.get("version", 0),
        "pushed_version": pushed_version,
        "draft_pushed": draft_pushed,
        "bridge_enabled": bool(SUPERVISOR_TOKEN),
        # Settings somebody changed with the buttons on the panel that this
        # layout does not yet agree with. Normally empty and normally empty
        # within a second of arriving, because the add-on adopts them and
        # pushes -- see backend/adopt.py. It stays filled only when the two
        # genuinely disagree, which is worth saying out loud rather than
        # leaving the editor showing a value the panel is ignoring.
        "device_overrides": link.overrides,
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
    # Which album pictures the layout wants, before and after. A photo widget
    # added, resized, or switched between fill and fit needs a different set of
    # pictures rendered, and the alternative to noticing here is making the user
    # press Refresh after every such edit and wonder why.
    #
    # Compared rather than refreshed unconditionally: this endpoint is called on
    # every edit in the browser -- every drag, every option -- and a refresh
    # reads iCloud and can dither for minutes.
    was = albums.variants_in(store.load())

    store.save(layout)
    # Adding, removing or renaming a page changes the options on the Page
    # select in Home Assistant. On save rather than on push, because the list
    # the editor is showing is the saved one.
    link.announce()

    if albums.variants_in(layout) != was:
        asyncio.create_task(refresh_albums(layout))

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


@app.post("/api/onboard")
async def send_to_setup() -> dict[str, Any]:
    """Restart the panel into its own access point so it can be set up again.

    The way to move a panel to a different network. Its credentials are not
    wrong -- they join something perfectly well -- so nothing on the device
    notices, and the editor is on the network it can no longer see. This is the
    only way in.

    Nothing is erased. The panel keeps its layout and its current credentials
    until somebody completes the form, so a command sent by accident costs a
    restart and a walk to the panel rather than a reconfiguration.
    """
    link.publish_command("onboard")
    return {"ok": True}


@app.post("/api/device-info")
async def show_device_info() -> dict[str, Any]:
    """Put the device's own diagnostics on the panel for a minute.

    Deliberately shown on the panel rather than returned here: everything the
    device knows otherwise reaches this add-on over MQTT, so when MQTT is what
    is broken none of it arrives. The one case where you most need to see the
    broker settings is the one where the device cannot tell us them.
    """
    link.publish_command("info")
    return {"ok": True}


@app.post("/api/page/{page_id}")
async def show_page(page_id: str) -> dict[str, Any]:
    """Put a specific page up now. The device still rotates on from it."""
    link.publish_command("page", page=page_id)
    return {"ok": True}


# --- what the device sends back about itself --------------------------------
#
# Uploads land in the *other* process, on the plain device port, and the two
# share only the data directory. So these read files rather than hold state:
# what is on disk is whatever the panel last sent.


@app.post("/api/screenshot")
async def ask_for_screenshot() -> dict[str, Any]:
    """Ask the panel for a picture of what it is showing.

    On request only. The framebuffer is already in the device's memory so a
    capture costs it nothing but the upload -- but an e-ink dashboard changes
    slowly, and a picture on a timer would mostly be the same picture again.
    """
    link.publish_command("screenshot")
    return {"ok": True}


@app.get("/api/screenshot")
async def get_screenshot() -> dict[str, Any]:
    held = reports.screenshot()
    return {"held": bool(held), **(held or {})}


@app.get("/api/screenshot.png")
async def get_screenshot_png() -> FileResponse:
    if not reports.screenshot():
        raise HTTPException(status_code=404, detail="No screenshot held")
    # Never cached: the URL does not change when a new picture arrives, and a
    # stale screenshot of a dashboard looks exactly like a current one.
    return FileResponse(
        reports.SCREENSHOT_PATH,
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


@app.post("/api/logs")
async def ask_for_logs() -> dict[str, Any]:
    """Ask the panel for its log ring."""
    link.publish_command("logs")
    return {"ok": True}


@app.get("/api/logs")
async def get_logs() -> dict[str, Any]:
    return reports.device_log()


@app.delete("/api/logs")
async def delete_logs() -> dict[str, Any]:
    reports.clear_log()
    return {"ok": True}


@app.get("/api/images")
async def get_images() -> dict[str, Any]:
    """What has been uploaded, plus what the device reports having of it.

    The device names the images on its card in its stats, so each one can be
    marked rather than showing only a total.
    """
    reported = (link.stats or {}).get("images") or {}
    return {
        # Uploads only. An album's pictures are images in every other respect,
        # but nobody picks one by name and a single album would bury the list
        # this and the widget inspector's image picker are both built from.
        "images": images.uploads(),
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
    rounded: bool = Form(True),
    dither: str = Form("atkinson"),
    prepared: bool = Form(False),
) -> dict[str, Any]:
    """Convert and store an upload, then tell the device about it.

    "exact" keeps the image's own pixel size and only thresholds it, for art
    drawn to match the UI. "photo" crops to fill width x height and dithers.

    "rounded" rounds a photo's corners to the widgets' radius, on by default
    because a photo among widgets looks like a mistake with square corners. It
    does not apply to "exact", where the point is fidelity to what was drawn.

    "prepared" says the upload is already a greyscale bitmap at its final size,
    which is what the crop editor sends: it has done the orientation, rotation,
    crop, scaling and levels itself so that the 1-bit preview it showed while
    you dragged is made of the very pixels dithered here. width and height are
    then taken from the bitmap and ignored if given.
    """
    try:
        entry = images.store(
            name or file.filename or "image", await file.read(), mode, width, height,
            rounded, dither, prepared,
        )
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


# --- photo albums ------------------------------------------------------------


@app.get("/api/albums")
async def get_albums() -> dict[str, Any]:
    """The configured albums, and how far each has been rendered.

    `rendered` is how many of the album's *photographs* are ready, not how many
    files exist. Each widget shape is its own complete set of renderings, so
    summing the files said "50 of 35" for one 35-photo album shown at two sizes
    -- a number that cannot be read as anything sensible. The deepest set is the
    honest answer to "how much of my album can the panel show".

    `sets` carries the other half of that, so the editor can say a shape is
    still being rendered rather than silently showing the finished one.
    """
    depth: dict[str, dict[str, int]] = {}
    for entry in images.listing():
        owner = entry.get("album")
        if not owner:
            continue
        # "album_1220x558_fb_007" -> "album_1220x558_fb"
        prefix = entry["name"].rsplit("_", 1)[0]
        counts = depth.setdefault(owner, {})
        counts[prefix] = counts.get(prefix, 0) + 1

    def progress(album_id: str) -> dict[str, int]:
        counts = depth.get(album_id, {})
        return {"rendered": max(counts.values(), default=0), "sets": len(counts)}

    return {
        "albums": [{**album, **progress(album["id"])} for album in albums.listing()],
        "refresh": albums.status(),
    }


@app.post("/api/albums")
async def post_album(body: dict[str, Any]) -> dict[str, Any]:
    """Add a shared album from its public link.

    Rendering is not waited for. Reading the album takes a moment and dithering
    it takes minutes, so the album is saved once iCloud has confirmed it exists
    and the pictures follow in the background -- otherwise the browser would sit
    on a spinner for the length of a holiday.
    """
    try:
        album = await albums.add(
            body.get("url") or "",
            body.get("name") or "",
            int(body.get("limit") or albums.DEFAULT_LIMIT),
        )
    except (albums.AlbumError, icloud.AlbumError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail=f"That is not a usable limit ({error}).")

    asyncio.create_task(refresh_albums())
    return album


@app.patch("/api/albums/{album_id}")
async def patch_album(album_id: str, body: dict[str, Any]) -> dict[str, Any]:
    try:
        album = albums.update(album_id, **body)
    except albums.AlbumError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error))

    # A changed limit means pictures to render or to drop, so this is not just
    # a settings write.
    asyncio.create_task(refresh_albums())
    return album


@app.delete("/api/albums/{album_id}")
async def delete_album(album_id: str) -> dict[str, Any]:
    if not albums.remove(album_id):
        raise HTTPException(status_code=404, detail="No such album")
    # Its rendered pictures go in the sweep at the end of a refresh, which also
    # republishes the manifest so the device clears them off its card.
    asyncio.create_task(refresh_albums())
    return {"ok": True}


@app.post("/api/albums/refresh")
async def post_album_refresh() -> dict[str, Any]:
    """Re-read every album now, rather than waiting for the poll.

    Returns immediately with the running status: a refresh can take minutes, and
    the Images tab polls `GET /api/albums` to follow it.
    """
    asyncio.create_task(refresh_albums())
    return albums.status()


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


async def _states() -> list[dict[str, Any]]:
    headers = {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}
    async with aiohttp.ClientSession(headers=headers) as session:
        async with session.get(f"{HA_REST_URL}/states") as response:
            response.raise_for_status()
            return await response.json()


@app.get("/api/entities")
async def get_entities() -> list[dict[str, str]]:
    """Entities for the editor's pickers, annotated with domain and area."""
    if not SUPERVISOR_TOKEN:
        return []
    return await registry.entities(await _states())


@app.get("/api/devices")
async def get_devices() -> list[dict[str, Any]]:
    """Devices for the device picker, each with its entities already ranked.

    The panel is never told what a device is -- the registry is websocket-only
    and needs credentials it does not have. The editor resolves a device to its
    entity ids here and writes that list into the layout, so the firmware still
    only ever sees entities. See the device widget in the firmware repo.
    """
    if not SUPERVISOR_TOKEN:
        return []
    return await registry.devices(await _states())


@app.get("/api/areas")
async def get_areas() -> list[dict[str, Any]]:
    """Areas for the room widget's picker, each with its entities already ranked.

    Same arrangement as /api/devices and for the same reason: the panel has no
    credentials to ask Home Assistant what an area is, so the editor resolves
    one to entity ids here and writes that list into the layout.
    """
    if not SUPERVISOR_TOKEN:
        return []
    return await registry.areas(await _states())


# The built editor is mounted last so it does not shadow /api. Ingress serves the
# add-on under a path prefix, which is why the frontend uses relative URLs.
if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/")
    async def index() -> FileResponse:
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
