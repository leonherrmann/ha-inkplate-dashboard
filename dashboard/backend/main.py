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
import grids
import ha_timer
import icloud
import images
import panels
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


def _models_behind() -> list[str]:
    """The boards of the panels that are not running what is held.

    Read from what each panel reports rather than from a setting: the add-on
    knows every panel's model and every panel's version, so asking anybody which
    board to offer a build to would be asking about something it can see.
    """
    held = firmware.store.state.get("version")
    if not held:
        return []

    behind = []
    for panel in panels.all():
        model = panel.get("model")
        if not model or not firmware.store.have_binary(model):
            continue
        running = ((link.panel(panel["id"]).stats or {}).get("firmware") or {}).get("running")
        # A panel that has never said what it runs counts as behind: it is
        # either new or old, and both want the offer.
        if running != held:
            behind.append(model)
    return behind


# What the firmware offers depend on: the release held, and every panel's board
# and running version. Kept so that the offers can be republished when one of
# them moves and *only* then -- the device link calls back on every message a
# panel sends, and re-publishing four retained topics on each of those would be
# a great deal of broker traffic to say the same thing.
_offer_fingerprint: tuple | None = None


def _offers_would_change() -> bool:
    global _offer_fingerprint
    now = (
        firmware.store.state.get("version"),
        tuple(
            (
                panel["id"],
                panel.get("model"),
                ((link.panel(panel["id"]).stats or {}).get("firmware") or {}).get("running"),
            )
            for panel in panels.all()
        ),
    )
    if now == _offer_fingerprint:
        return False
    _offer_fingerprint = now
    return True


def _on_device_message() -> None:
    """A panel said something. Re-offer firmware if that changed the answer.

    This is what makes a panel that is switched on *after* the add-on started
    get an offer at all -- and, when the first panel of a new board appears, what
    hands it the shared topic it may be the only one able to read. Before this,
    offers were published at startup and when a release changed, so a panel that
    arrived in between waited for one of those.

    Called from paho's own thread, so the work is handed to the event loop
    rather than done here.
    """
    loop = _loop
    if loop is None or not _offers_would_change():
        return
    asyncio.run_coroutine_threadsafe(publish_firmware(), loop)


# The loop publish_firmware has to run on, captured at startup: the device link
# calls back from the MQTT thread, where there is no running loop.
_loop: asyncio.AbstractEventLoop | None = None


async def publish_firmware() -> None:
    """Tell each panel what build is on offer for it, and where to fetch it.

    Per panel, because the binaries are not interchangeable: one release holds
    an image per board, and a panel offered the other one refuses it. A panel
    with no build for its model is sent an empty offer, which is the honest
    answer and what stops the editor showing it an Update button.

    The one shared topic is written too, for firmware older than per-device
    topics -- which board's build it carries is worked out from the panels
    themselves; see FirmwareStore.shared_model.
    """
    base = await image_base_url()
    for panel in panels.all():
        link.publish_firmware_for(
            panel["id"], firmware.store.manifest(base, panel.get("model"))
        )
    link.publish_firmware(
        firmware.store.manifest(base, firmware.store.shared_model(_models_behind()))
    )
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


def _every_layout() -> list[tuple[grids.Grid, dict[str, Any]]]:
    """Every panel's draft, each with the grid it is drawn against.

    The albums are shared -- one library of pictures, one set of rendered
    variants -- so which photos are wanted is a question about the layouts of
    every panel together, not about whichever one the editor is showing.

    The grid rides along because a photo widget's *pixel* size is the panel's,
    not the layout's: a 3x2 photo is 710x362 on a V2 and 685x408 on a V1, and
    those are two different pictures to render and two different filenames. This
    returned bare layouts for a while, which the album refresh unpacked as pairs
    and died on -- so nothing was rendered at all, and the first panel to ask for
    a size nobody had rendered yet drew ALBUM IS EMPTY.
    """
    # Both shapes of every panel, not just the one it is standing in. A page
    # keeps an arrangement per shape and a photo widget in the sideways one
    # needs pictures of its own -- rendered before the panel is turned, not
    # after, or turning it shows ALBUM IS EMPTY until the next refresh.
    out: list[tuple[grids.Grid, dict[str, Any]]] = []
    for panel in panels.all():
        layout = store.load(panel["id"])
        for grid in grids.shapes_of(panel["id"]).values():
            out.append((grid, layout))
    return out


async def refresh_albums(layouts: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Bring the albums' pictures into line with the layouts, then tell the devices.

    The layouts are the drafts rather than what was pushed, deliberately:
    someone who has just dropped a photo widget on a page wants its pictures
    rendered before they push, not after.

    `layouts` is passed in by the one caller that already has them -- saving an
    edit -- rather than re-read from disk. Re-reading raced the save that had
    just happened and could come back empty, which is how an album's pictures
    were once deleted for a layout that did have a photo widget in it.
    """
    return await albums.refresh(
        _every_layout() if layouts is None else layouts, on_change=publish_images
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
            starving = albums.starved(_every_layout())
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
    last: dict[str, float] = {}
    while True:
        try:
            for panel in panels.all():
                panel_id = panel["id"]
                held = reports.screenshot(panel_id)
                taken = held.get("taken_at") if held else None
                if not taken or taken == last.get(panel_id):
                    continue
                base = await image_base_url()
                if base:
                    link.publish_screenshot(
                        panel_id,
                        f"{base}/device/screenshot.png?device={panel_id}&t={int(taken)}",
                    )
                    log.info("Published a new screenshot of %s to Home Assistant", panel_id)
                last[panel_id] = taken
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
    global _loop
    _loop = asyncio.get_running_loop()
    # Every message from a panel goes through here; see _on_device_message for
    # why it is cheap.
    link.on_change = _on_device_message

    # Said out loud when the option had to be corrected: the panel wants
    # `http://host:port` exactly, an address typed into an add-on option is
    # usually neither, and silently fixing it would hide a setting that does not
    # say what the user thinks it says.
    typed = os.environ.get("IMAGE_BASE_URL", "").strip()
    if typed and typed.rstrip("/") != IMAGE_BASE_URL:
        log.info("Reading image_base_url '%s' as '%s'", typed, IMAGE_BASE_URL)

    link.start()
    bridge.start()
    weather.start()
    # Follow whatever the stored layout already references, so a restart of the
    # add-on keeps feeding the device without waiting for a push.
    # Every panel's entities, not one panel's: the state topics are shared, and
    # following only one panel's would starve the others of their readings.
    entities = store.every_entity_id()
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
        lambda panel_id, command: link.publish_command(
            panel_id, command.pop("action"), **command
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


def _push_state(panel_id: str, layout: dict[str, Any]) -> tuple[bool, int | None]:
    """Whether the draft still matches what went out, and which version that was.

    Answered here rather than in the browser so the digest is never recomputed,
    or reimplemented, on the other side of the wire.
    """
    last = store.pushed(panel_id)
    if last:
        return last.get("digest") == store.fingerprint(layout), last.get("version")

    # No record kept: either nothing has ever been pushed from this install, or
    # it predates the record being kept at all. The device's own echo is the
    # evidence that settles it -- a panel reporting this very version was sent
    # it, whether or not anything wrote that down at the time.
    applied = link.panel(panel_id).applied or {}
    version = layout.get("version", 0)
    if applied.get("version") == version and applied.get("ok") is not False:
        return True, version
    return False, None


def _panel(panel: str | None) -> str:
    """Which panel a request is about.

    `?panel=` names one; without it the default is used, which for an install
    that has only ever had one panel is that panel. A request that arrives
    before any panel has been heard from has no answer -- the editor shows its
    "waiting for a panel" state rather than an empty dashboard for a device that
    may not exist.
    """
    resolved = panels.resolve(panel)
    if not resolved:
        raise HTTPException(
            status_code=503,
            detail=(
                "No panel has been seen yet. Power one on and make sure it reaches "
                "the same MQTT broker as Home Assistant."
            ),
        )
    return resolved


@app.get("/api/panels")
async def get_panels() -> dict[str, Any]:
    """Every panel this add-on knows about, for the device dropdown.

    Each carries enough to be chosen between without a second request: what it
    is called, what shape it is, and whether it is online now.
    """
    listed = []
    for panel in panels.all():
        state = link.panel(panel["id"])
        grid = grids.of(panel["id"])
        listed.append(
            {
                **panel,
                "online": state.online,
                "last_seen": state.last_seen or panel.get("last_seen"),
                "width": grid.width,
                "height": grid.height,
                "has_manifest": state.manifest is not None,
            }
        )
    return {"panels": listed, "default": panels.default_id()}


@app.patch("/api/panels/{panel_id}")
async def rename_panel(panel_id: str, body: dict[str, Any]) -> dict[str, Any]:
    """Name a panel. The name is the add-on's, not the device's -- see panels.py."""
    try:
        panel = panels.rename(panel_id, str(body.get("name") or ""))
    except KeyError:
        raise HTTPException(status_code=404, detail="No such panel")

    # The name is the Home Assistant device's name too, and the layout carries
    # it so the panel can show it on its own info screen.
    link.announce(panel_id)
    layout = store.load(panel_id)
    if layout.get("name") != panel["name"]:
        layout["name"] = panel["name"]
        store.save(panel_id, layout)
    return panel


@app.delete("/api/panels/{panel_id}")
async def forget_panel(panel_id: str) -> dict[str, Any]:
    """Drop a panel from the list.

    Its layout stays on disk: a panel unplugged for a fortnight and a panel gone
    for good look identical from here, and one of those two mistakes cannot be
    undone. A panel that comes back announces itself and reappears, with its
    dashboard intact.
    """
    return {"ok": panels.forget(panel_id)}


@app.get("/api/status")
async def get_status(panel: str | None = None) -> dict[str, Any]:
    panel_id = _panel(panel)
    state = link.panel(panel_id)
    layout = store.load(panel_id)
    draft_pushed, pushed_version = _push_state(panel_id, layout)
    return {
        "device_id": panel_id,
        "panel": panels.get(panel_id),
        "online": state.online,
        "manifest": state.manifest,
        "applied": state.applied,
        "stats": state.stats,
        "charging": state.charging,
        "current_page": state.current_page,
        "page_locked": state.page_locked,
        "last_seen": state.last_seen,
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
        "device_overrides": state.overrides,
    }


@app.get("/api/history")
async def get_history(panel: str | None = None) -> dict[str, Any]:
    """Voltage and availability samples for the Device panel's sparkline."""
    return {"samples": history.samples(_panel(panel))}


@app.get("/api/manifest")
async def get_manifest(panel: str | None = None) -> dict[str, Any]:
    manifest = link.panel(_panel(panel)).manifest
    if not manifest:
        raise HTTPException(
            status_code=503,
            detail=(
                "No manifest received yet. The device publishes it at boot, "
                "so power it on and make sure it reaches the same MQTT broker."
            ),
        )
    return manifest


@app.get("/api/layout")
async def get_layout(panel: str | None = None) -> dict[str, Any]:
    return store.load(_panel(panel))


@app.put("/api/layout")
async def put_layout(layout: dict[str, Any], panel: str | None = None) -> dict[str, Any]:
    # Which album pictures the layout wants, before and after. A photo widget
    # added, resized, or switched between fill and fit needs a different set of
    # pictures rendered, and the alternative to noticing here is making the user
    # press Refresh after every such edit and wonder why.
    #
    # Compared rather than refreshed unconditionally: this endpoint is called on
    # every edit in the browser -- every drag, every option -- and a refresh
    # reads iCloud and can dither for minutes.
    panel_id = _panel(panel)
    grid = grids.of(panel_id)
    was = albums.variants_in(store.load(panel_id), grid)

    store.save(panel_id, layout)
    # Adding, removing or renaming a page changes the options on the Page
    # select in Home Assistant. On save rather than on push, because the list
    # the editor is showing is the saved one.
    link.announce(panel_id)

    if albums.variants_in(layout, grid) != was:
        asyncio.create_task(refresh_albums())

    return {"ok": True}


@app.post("/api/push")
async def push_layout(panel: str | None = None) -> dict[str, Any]:
    panel_id = _panel(panel)
    layout = store.load(panel_id)
    layout["version"] = int(layout.get("version", 0)) + 1

    # The panel shows this on its own info screen, which is the screen you reach
    # when MQTT is broken and the editor can tell you nothing.
    named = panels.get(panel_id) or {}
    if named.get("name"):
        layout["name"] = named["name"]

    # The device has no tzdata, so it is told Home Assistant's zone as a POSIX
    # string. Sent with every push so a DST rule change cannot leave it stale.
    layout["timezone"] = timezone.to_posix(registry.time_zone)

    store.save(panel_id, layout)

    sent = link.publish_layout(panel_id, layout)
    # Only a push that reached the broker counts as sent. Recording one that did
    # not would leave the editor claiming to be waiting on the device, when what
    # it is really waiting on is its own connection.
    if sent:
        store.record_pushed(panel_id, layout)
    # Every panel's entities, not this one's: the state topics are shared, so
    # narrowing them to the panel just pushed would stop the others' readings.
    entities = store.every_entity_id()
    bridge.follow(entities)
    weather.follow(entities)

    return {"ok": sent, "version": layout["version"]}


@app.post("/api/refresh")
async def refresh_device(panel: str | None = None) -> dict[str, Any]:
    link.publish_command(_panel(panel), "refresh")
    return {"ok": True}


@app.post("/api/onboard")
async def send_to_setup(panel: str | None = None) -> dict[str, Any]:
    """Restart the panel into its own access point so it can be set up again.

    The way to move a panel to a different network. Its credentials are not
    wrong -- they join something perfectly well -- so nothing on the device
    notices, and the editor is on the network it can no longer see. This is the
    only way in.

    Nothing is erased. The panel keeps its layout and its current credentials
    until somebody completes the form, so a command sent by accident costs a
    restart and a walk to the panel rather than a reconfiguration.
    """
    link.publish_command(_panel(panel), "onboard")
    return {"ok": True}


@app.post("/api/device-info")
async def show_device_info(panel: str | None = None) -> dict[str, Any]:
    """Put the device's own diagnostics on the panel for a minute.

    Deliberately shown on the panel rather than returned here: everything the
    device knows otherwise reaches this add-on over MQTT, so when MQTT is what
    is broken none of it arrives. The one case where you most need to see the
    broker settings is the one where the device cannot tell us them.
    """
    link.publish_command(_panel(panel), "info")
    return {"ok": True}


@app.post("/api/page/{page_id}")
async def show_page(page_id: str, panel: str | None = None) -> dict[str, Any]:
    """Put a specific page up now. The device still rotates on from it."""
    link.publish_command(_panel(panel), "page", page=page_id)
    return {"ok": True}


@app.post("/api/page-lock/{state}")
async def set_page_lock(state: str, panel: str | None = None) -> dict[str, Any]:
    """Pin rotation to whatever page is on the panel now, or let it go again.

    The same gesture as a hold on the panel's right button, reachable without
    a walk over to it. Like that hold, this is not written to the layout: a
    lock that survived a reboot would be a panel stuck on one page with
    nothing on screen to say why.
    """
    link.publish_command(_panel(panel), "lock", locked=state == "on")
    return {"ok": True}


# --- what the device sends back about itself --------------------------------
#
# Uploads land in the *other* process, on the plain device port, and the two
# share only the data directory. So these read files rather than hold state:
# what is on disk is whatever the panel last sent.


@app.post("/api/screenshot")
async def ask_for_screenshot(panel: str | None = None) -> dict[str, Any]:
    """Ask the panel for a picture of what it is showing.

    On request only. The framebuffer is already in the device's memory so a
    capture costs it nothing but the upload -- but an e-ink dashboard changes
    slowly, and a picture on a timer would mostly be the same picture again.
    """
    link.publish_command(_panel(panel), "screenshot")
    return {"ok": True}


@app.get("/api/screenshot")
async def get_screenshot(panel: str | None = None) -> dict[str, Any]:
    held = reports.screenshot(_panel(panel))
    return {"held": bool(held), **(held or {})}


@app.get("/api/screenshot.png")
async def get_screenshot_png(panel: str | None = None) -> FileResponse:
    panel_id = _panel(panel)
    if not reports.screenshot(panel_id):
        raise HTTPException(status_code=404, detail="No screenshot held")
    # Never cached: the URL does not change when a new picture arrives, and a
    # stale screenshot of a dashboard looks exactly like a current one.
    return FileResponse(
        reports.screenshot_path(panel_id),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


@app.post("/api/logs")
async def ask_for_logs(panel: str | None = None) -> dict[str, Any]:
    """Ask the panel for its log ring."""
    link.publish_command(_panel(panel), "logs")
    return {"ok": True}


@app.get("/api/logs")
async def get_logs(panel: str | None = None) -> dict[str, Any]:
    return reports.device_log(_panel(panel))


@app.delete("/api/logs")
async def delete_logs(panel: str | None = None) -> dict[str, Any]:
    reports.clear_log(_panel(panel))
    return {"ok": True}


@app.get("/api/images")
async def get_images(panel: str | None = None) -> dict[str, Any]:
    """What has been uploaded, plus what the device reports having of it.

    The device names the images on its card in its stats, so each one can be
    marked rather than showing only a total.
    """
    reported = (link.panel(_panel(panel)).stats or {}).get("images") or {}
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


# Declared before the /{album_id} routes below would be a problem only if they
# could match "refresh"; they cannot, since that one is a POST to a longer path.
# These three are the photo picker.


@app.get("/api/albums/{album_id}/photos")
async def get_album_photos(album_id: str, force: bool = False) -> dict[str, Any]:
    """Every photograph in an album, and which are being shown.

    Reads iCloud rather than the rendered pictures, because the point is to
    show what could be chosen -- including the ones nothing has rendered.
    """
    try:
        return await albums.photos_for_picker(album_id, force=force)
    except (albums.AlbumError, icloud.AlbumError) as error:
        raise HTTPException(status_code=400, detail=str(error))


@app.put("/api/albums/{album_id}/selection")
async def put_album_selection(album_id: str, body: dict[str, Any]) -> dict[str, Any]:
    """Choose which photographs the panel shows.

    `selected: null` hands the album back to its limit, which is what an album
    nobody has opened the picker for already does.
    """
    try:
        album = albums.update(album_id, selected=body.get("selected"))
    except albums.AlbumError as error:
        raise HTTPException(status_code=400, detail=str(error))

    # Pictures to render or to drop, and a renumbering besides -- see
    # albums.chosen(). Not just a settings write.
    asyncio.create_task(refresh_albums())
    return album


@app.get("/api/albums/{album_id}/photos/{guid}/thumb.jpg")
async def get_album_thumb(album_id: str, guid: str) -> FileResponse:
    """A small copy of one photograph, for the picker.

    Served from here rather than linked straight to iCloud: those URLs are
    signed and expire within the hour, so a tab left open would fill with
    broken images.
    """
    try:
        path = await albums.thumbnail(album_id, guid)
    except (albums.AlbumError, icloud.AlbumError) as error:
        raise HTTPException(status_code=404, detail=str(error))
    # Cached hard: a thumbnail is immutable -- a different photograph is a
    # different guid -- so the browser should never ask twice.
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )


@app.get("/api/firmware")
async def get_firmware(panel: str | None = None) -> dict[str, Any]:
    """What is held here, and what that panel says it is running."""
    panel_id = _panel(panel)
    reported = (link.panel(panel_id).stats or {}).get("firmware") or {}
    # Which panel the held build is for, and which this one is. A binary is not
    # interchangeable between the two shapes of panel, and the firmware ignores
    # an offer that is not its own -- so the editor has to be able to say that
    # rather than showing an Update button that does nothing.
    model = (panels.get(panel_id) or {}).get("model")
    # A release holds an image per board. What matters to this panel is whether
    # one of them is for *it* -- not what else the release contains.
    held_for_panel = bool(model and firmware.store.have_binary(model))
    return {
        "repo": FIRMWARE_REPO,
        "held": firmware.store.state,
        "device": reported,
        "servable": bool(
            firmware.store.have_binary(model or None) and await image_base_url()
        ),
        # Which boards this release was built for, and whether one of them is
        # this panel's. Unknown model is not a mismatch: a panel that has never
        # sent a manifest has not said what it is, and refusing to offer it an
        # update would be worse than offering one its firmware can refuse for
        # itself.
        "built_for": firmware.store.models() or [firmware.LEGACY_MODEL],
        "panel_model": model,
        "model_matches": not model or held_for_panel,
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
async def update_firmware(panel: str | None = None) -> dict[str, Any]:
    """Tell one panel to fetch and install what is on offer.

    One panel rather than all of them: the binary on offer is built for a
    particular board, and the two panels this add-on can manage are two boards.
    Updating them is a thing you do deliberately, one at a time, watching.
    """
    if not firmware.store.have_binary():
        raise HTTPException(status_code=400, detail="No firmware held to install")
    # Republished first, so the device is certainly holding the current offer
    await publish_firmware()
    link.publish_command(_panel(panel), "update")
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
