"""FastAPI app: serves the editor and exposes the device to it."""

import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any

import aiohttp
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import store
from ha_bridge import bridge
from history import history
from mqtt import link
import timezone
from registry import registry
from weather import weather
from settings import HA_REST_URL, LOG_LEVEL, STATIC_DIR, SUPERVISOR_TOKEN, DEVICE_ID

logging.basicConfig(level=LOG_LEVEL, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("inkplate")


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
    yield
    await weather.stop()
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
        "stats": link.stats,
        "charging": link.charging,
        "last_seen": link.last_seen,
        "server_time": time.time(),
        "draft_version": layout.get("version", 0),
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

    link.publish_layout(layout)
    # The device only needs the entities this layout actually names
    entities = store.entity_ids(layout)
    bridge.follow(entities)
    weather.follow(entities)

    return {"ok": True, "version": layout["version"]}


@app.post("/api/refresh")
async def refresh_device() -> dict[str, Any]:
    link.publish_command("refresh")
    return {"ok": True}


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
