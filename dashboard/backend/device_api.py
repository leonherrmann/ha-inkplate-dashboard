"""What the device fetches over HTTP, and what it sends back.

Served on its own plain port rather than through the editor's app, because the
editor is behind Home Assistant's authenticated ingress and the Inkplate has no
way to authenticate. What it hands out is not secret -- 1-bit bitmaps of pictures
the user uploaded, and the firmware binary the add-on has already downloaded.

The two upload routes are the exception, and they are unauthenticated by choice:
anything on the local network can post a screenshot or a page of log and the
add-on will believe it. A token carried over MQTT was offered and declined, on
the grounds that this is a home LAN. Worth knowing, since these are the only
routes here that *write*, and a picture of the dashboard says more about the
household than the clipart the rest of this file serves.

Run as a second uvicorn process from run.sh; it shares only the data directory
with the editor, not the MQTT link.
"""

import logging
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse

import firmware
import images
import manifest_store
import reports

log = logging.getLogger("inkplate.device")

app = FastAPI(title="Inkplate Dashboard (device)", docs_url=None, redoc_url=None)


@app.get("/images/{name}.bin")
async def get_image(name: str) -> FileResponse:
    # Normalising rather than trusting the path keeps ".." and absolute paths
    # from ever reaching the filesystem.
    try:
        safe = images.normalise_name(name)
    except images.ImageError:
        raise HTTPException(status_code=404, detail="No such image")

    path = images.blob_path(safe)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="No such image")

    return FileResponse(path, media_type="application/octet-stream")


@app.get("/firmware.bin")
async def get_firmware() -> FileResponse:
    """The release binary, re-served in plain HTTP because the device has no TLS."""
    # The file, not the store's cached state: this runs in its own process, so
    # its copy of that state is whatever it was at startup and goes stale the
    # moment the editor downloads a release.
    path = firmware.store.binary_path
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="No firmware held")
    return FileResponse(path, media_type="application/octet-stream")


@app.post("/device/screenshot")
async def post_screenshot(
    request: Request, rotation: int = reports.DEFAULT_ROTATION
) -> dict[str, object]:
    """The panel's framebuffer, verbatim, stored here as a PNG.

    The body is the raw 1-bit buffer rather than something the device encoded:
    the ESP32 has no business compressing 115KB when the add-on can, and those
    bytes are already in memory as the thing the panel is showing.

    The buffer is in the panel's own orientation, which is not the one the
    device draws in -- so it says which way up it was drawing and the picture is
    turned back here. Doing it on the device would need a second 115KB buffer it
    has no room for.
    """
    raw = await request.body()
    try:
        meta = reports.save_screenshot(raw, rotation)
    except ValueError as problem:
        # A wrong length means a truncated upload or a different panel, not a
        # smaller picture -- so it is refused rather than padded or cropped.
        log.warning("Refused a screenshot: %s", problem)
        raise HTTPException(status_code=400, detail=str(problem))
    return {"ok": True, **meta}


@app.post("/device/log")
async def post_log(request: Request, reason: str = "asked") -> dict[str, object]:
    """A page of the device's log ring.

    The reason rides in the query string so the body stays exactly what the
    device printed. "boot" is the one that arrives unasked, and it is the one
    worth having -- the faults this panel has had all happen during setup, hours
    from anyone holding a serial cable.
    """
    body = await request.body()
    text = body.decode("utf-8", errors="replace")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Empty log")
    # Bounded here as well as by the device's own ring, because this route is
    # open: what arrives is not necessarily what the panel sent.
    if len(text) > reports.LOG_LIMIT_BYTES:
        text = text[-reports.LOG_LIMIT_BYTES :]
    return {"ok": True, **reports.save_log(text, reason[:40])}


@app.post("/device/manifest")
async def post_manifest(request: Request) -> dict[str, object]:
    """Everything the panel's firmware can draw.

    Here rather than over MQTT because it is 15KB in one piece, and one MQTT
    publish of that size is more than this panel's WiFi can reliably push: the
    write stalls for ten seconds, leaves half a packet in the stream and takes
    the broker session with it. Over HTTP the body is written and read
    incrementally by both ends and none of that arises. See manifest_store.

    The MQTT topic is still read, for firmware that knows no other way.
    """
    raw = await request.body()
    try:
        stored = manifest_store.save(raw)
    except manifest_store.ManifestError as problem:
        # Refused rather than stored: a manifest the editor cannot build a
        # palette from looks to the user like a broken add-on.
        log.warning("Refused a manifest: %s", problem)
        raise HTTPException(status_code=400, detail=str(problem))

    count = len(stored.get("widgets", []))
    log.info("Device posted a manifest describing %d widget types (%d bytes)", count, len(raw))
    return {"ok": True, "widgets": count}


@app.get("/device/screenshot.png")
async def get_screenshot() -> FileResponse:
    """The newest screenshot, for Home Assistant's image entity to fetch.

    Here rather than only on the editor's app because Home Assistant fetches it
    over plain HTTP with no add-on session: the editor is behind authenticated
    ingress, so a URL there would answer with a login page.
    """
    if not os.path.isfile(reports.SCREENSHOT_PATH):
        raise HTTPException(status_code=404, detail="No screenshot held")
    return FileResponse(
        reports.SCREENSHOT_PATH,
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/health")
async def health() -> dict[str, bool]:
    """So you can check the port is reachable from the device's network."""
    return {"ok": True}
