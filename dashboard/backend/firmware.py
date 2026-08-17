"""Watches the firmware repo's releases and holds the binary for the device.

The device cannot fetch a release itself: GitHub is HTTPS, and linking a TLS
stack into the firmware for that would cost more flash than its entire icon set.
So the add-on does the part that needs TLS, caches the binary, and re-serves it
on the same plain-HTTP port the device already uses for images.

Unauthenticated GitHub API calls are limited to 60 an hour per address, which a
six-hourly poll plus the occasional manual check stays well inside.
"""

import asyncio
import hashlib
import json
import logging
import os
from typing import Any

import aiohttp

from settings import DATA_DIR, FIRMWARE_REPO, FIRMWARE_POLL_HOURS

log = logging.getLogger(__name__)

FIRMWARE_DIR = os.path.join(DATA_DIR, "firmware")
STATE_PATH = os.path.join(FIRMWARE_DIR, "state.json")
BINARY_NAME = "firmware.bin"

# A release asset larger than this is not one of ours; the app partition is 1.9MB
MAX_BYTES = 4 * 1024 * 1024


class FirmwareStore:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self.state: dict[str, Any] = self._load()

    # -- persistence -------------------------------------------------------

    def _load(self) -> dict[str, Any]:
        try:
            with open(STATE_PATH, "r", encoding="utf-8") as handle:
                return json.load(handle)
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return {}

    def _save(self) -> None:
        os.makedirs(FIRMWARE_DIR, exist_ok=True)
        with open(STATE_PATH, "w", encoding="utf-8") as handle:
            json.dump(self.state, handle, indent=2)

    @property
    def binary_path(self) -> str:
        return os.path.join(FIRMWARE_DIR, BINARY_NAME)

    def have_binary(self) -> bool:
        return bool(self.state.get("version")) and os.path.isfile(self.binary_path)

    # -- lifecycle ---------------------------------------------------------

    def start(self, on_change) -> None:
        if not FIRMWARE_REPO:
            log.info("No firmware repo configured, over-the-air updates are off")
            return
        self._task = asyncio.create_task(self._poll_forever(on_change))

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _poll_forever(self, on_change) -> None:
        while True:
            try:
                if await self.check():
                    await on_change()
            except asyncio.CancelledError:
                raise
            except Exception as error:  # a poll failing must not stop the add-on
                log.warning("Firmware check failed: %s", error)
            await asyncio.sleep(FIRMWARE_POLL_HOURS * 3600)

    # -- the work ----------------------------------------------------------

    async def check(self) -> bool:
        """Fetch the latest release, download it if it is new. True if changed."""
        if not FIRMWARE_REPO:
            return False

        url = f"https://api.github.com/repos/{FIRMWARE_REPO}/releases/latest"
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "inkplate-dashboard"}

        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get(url, timeout=20) as response:
                if response.status == 404:
                    self.state["error"] = f"{FIRMWARE_REPO} has no releases yet"
                    self._save()
                    return False
                response.raise_for_status()
                release = await response.json()

            version = release.get("tag_name") or release.get("name")
            asset = next(
                (a for a in release.get("assets", []) if a.get("name", "").endswith(".bin")),
                None,
            )
            if not version or not asset:
                self.state["error"] = f"Release {version} has no .bin attached"
                self._save()
                return False

            if asset.get("size", 0) > MAX_BYTES:
                self.state["error"] = f"{asset['name']} is too large to be firmware"
                self._save()
                return False

            if self.state.get("version") == version and self.have_binary():
                return False  # already held

            log.info("Downloading firmware %s (%s)", version, asset["name"])
            async with session.get(asset["browser_download_url"], timeout=180) as response:
                response.raise_for_status()
                payload = await response.read()

        os.makedirs(FIRMWARE_DIR, exist_ok=True)
        with open(self.binary_path, "wb") as handle:
            handle.write(payload)

        self.state = {
            "version": version,
            "bytes": len(payload),
            # The device checks this before making the image bootable, so a
            # transfer that went wrong never gets run.
            "sha256": hashlib.sha256(payload).hexdigest(),
            "notes": (release.get("body") or "")[:2000],
            "published": release.get("published_at"),
            "error": None,
        }
        self._save()
        log.info("Holding firmware %s, %d bytes", version, len(payload))
        return True

    def manifest(self, base_url: str) -> dict[str, Any]:
        """What the device needs to decide whether to update, and where from."""
        if not self.have_binary() or not base_url:
            return {}
        return {
            "version": self.state["version"],
            "url": f"{base_url.rstrip('/')}/{BINARY_NAME}",
            "bytes": self.state["bytes"],
            "sha256": self.state["sha256"],
        }


store = FirmwareStore()
