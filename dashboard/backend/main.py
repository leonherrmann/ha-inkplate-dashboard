"""FastAPI app: serves the editor and exposes the device to it."""

import logging
import os
from contextlib import asynccontextmanager
from typing import Any

import aiohttp
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import store
from ha_bridge import bridge
from mqtt import link
from settings import HA_REST_URL, LOG_LEVEL, STATIC_DIR, SUPERVISOR_TOKEN, DEVICE_ID

logging.basicConfig(level=LOG_LEVEL, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("inkplate")


@asynccontextmanager
async def lifespan(app: FastAPI):
    link.start()
    bridge.start()
    # Follow whatever the stored layout already references, so a restart of the
    # add-on keeps feeding the device without waiting for a push.
    bridge.follow(store.entity_ids(store.load()))
    yield
    await bridge.stop()
    link.stop()


app = FastAPI(title="Inkplate Dashboard", lifespan=lifespan)


@app.get("/api/status")
async def get_status() -> dict[str, Any]:
    layout = store.load()
    return {
        "device_id": DEVICE_ID,
        "online": link.online,
        "manifest": link.manifest,
        "applied": link.applied,
        "draft_version": layout.get("version", 0),
        "bridge_enabled": bool(SUPERVISOR_TOKEN),
    }


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
    store.save(layout)

    link.publish_layout(layout)
    # The device only needs the entities this layout actually names
    bridge.follow(store.entity_ids(layout))

    return {"ok": True, "version": layout["version"]}


@app.post("/api/refresh")
async def refresh_device() -> dict[str, Any]:
    link.publish_command("refresh")
    return {"ok": True}


@app.get("/api/entities")
async def get_entities() -> list[dict[str, str]]:
    """Entity ids for the editor's pickers, straight from Home Assistant."""
    if not SUPERVISOR_TOKEN:
        return []
    headers = {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}
    async with aiohttp.ClientSession(headers=headers) as session:
        async with session.get(f"{HA_REST_URL}/states") as response:
            response.raise_for_status()
            states = await response.json()

    return [
        {
            "entity_id": state["entity_id"],
            "name": (state.get("attributes") or {}).get("friendly_name", state["entity_id"]),
        }
        for state in states
    ]


# The built editor is mounted last so it does not shadow /api. Ingress serves the
# add-on under a path prefix, which is why the frontend uses relative URLs.
if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/")
    async def index() -> FileResponse:
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
