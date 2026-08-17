"""The one thing the device fetches over HTTP: image blobs.

Served on its own plain port rather than through the editor's app, because the
editor is behind Home Assistant's authenticated ingress and the Inkplate has no
way to authenticate. Nothing here is writable and nothing here is secret -- it
hands out 1-bit bitmaps of pictures the user uploaded.

Run as a second uvicorn process from run.sh; it shares only the data directory
with the editor, not the MQTT link.
"""

import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

import firmware
import images

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


@app.get("/health")
async def health() -> dict[str, bool]:
    """So you can check the port is reachable from the device's network."""
    return {"ok": True}
