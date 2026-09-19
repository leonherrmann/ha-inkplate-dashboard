"""Watches the firmware repo's releases and holds the binaries for the panels.

The device cannot fetch a release itself: GitHub is HTTPS, and linking a TLS
stack into the firmware for that would cost more flash than its entire icon set.
So the add-on does the part that needs TLS, caches the binary, and re-serves it
on the same plain-HTTP port the device already uses for images.

Unauthenticated GitHub API calls are limited to 60 an hour per address. The
five-minute poll spends twelve of those, and each poll is one call: the release
listing. The binaries are only fetched when the version in the listing has
actually changed, so a panel already up to date costs nothing but that request.

**One release, one version, a binary per panel.** The firmware is one source
tree that compiles for two boards, and the two images are not interchangeable:
a V2 image on a V1 drives a framebuffer of the wrong size and is recoverable
only over USB. A release therefore carries an asset per model, named after it --
`ha_dashboard-inkplate5v2.bin` -- and this holds each one under that name. A
release with a single unnamed `.bin`, which is every release made before this,
is taken to be LEGACY_MODEL below, which is what it always was.
"""

import asyncio
import hashlib
import json
import logging
import os
from typing import Any

import aiohttp

from settings import (
    DATA_DIR,
    FIRMWARE_POLL_MINUTES,
    FIRMWARE_REPO,
    FIRMWARE_TOKEN,
)

log = logging.getLogger(__name__)

# The board this firmware was built for before it was built for two, and so:
# what an unnamed release asset must be, and what the one shared offer carries
# when no panel needs it to carry anything else. A constant rather than an
# option -- it is a fact about which releases exist, and nobody should have to
# know it, let alone choose it.
LEGACY_MODEL = "inkplate5v2"

FIRMWARE_DIR = os.path.join(DATA_DIR, "firmware")
STATE_PATH = os.path.join(FIRMWARE_DIR, "state.json")

# What the device port serves each build as. The model is in the name rather
# than in a query so that a panel's URL is a *different* URL -- a cache, a proxy
# or a retained manifest holding the other one would otherwise be handing a
# panel the wrong image under a name that looks right.
def binary_name(model: str) -> str:
    return f"firmware-{model}.bin"


# Which models a release's assets can be for. Read from the asset names rather
# than configured: the release says what it built, and an add-on that had to be
# told would be wrong the moment the firmware gained a board.
def model_in(asset_name: str) -> str | None:
    stem = asset_name[:-4] if asset_name.endswith(".bin") else asset_name
    for part in stem.replace("_", "-").split("-"):
        if part.startswith("inkplate"):
            return part
    return None

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

    def binary_path(self, model: str) -> str:
        return os.path.join(FIRMWARE_DIR, binary_name(model))

    def builds(self) -> dict[str, Any]:
        """What is held, by model: {"inkplate5v2": {"bytes":…, "sha256":…}}."""
        held = self.state.get("builds")
        return held if isinstance(held, dict) else {}

    def have_binary(self, model: str | None = None) -> bool:
        """Whether there is a build to offer -- for one model, or for any."""
        if not self.state.get("version"):
            return False
        wanted = [model] if model else list(self.builds())
        return any(one and os.path.isfile(self.binary_path(one)) for one in wanted)

    def models(self) -> list[str]:
        return sorted(one for one in self.builds() if os.path.isfile(self.binary_path(one)))

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
            await asyncio.sleep(FIRMWARE_POLL_MINUTES * 60)

    # -- the work ----------------------------------------------------------

    async def check(self) -> bool:
        """Fetch the latest release, download it if it is new. True if changed."""
        if not FIRMWARE_REPO:
            return False

        url = f"https://api.github.com/repos/{FIRMWARE_REPO}/releases/latest"
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "inkplate-dashboard"}
        if FIRMWARE_TOKEN:
            headers["Authorization"] = f"Bearer {FIRMWARE_TOKEN}"

        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get(url, timeout=20) as response:
                if response.status == 404:
                    # A private repo answers 404 rather than 403, so the two are
                    # indistinguishable from here -- say both.
                    self.state["error"] = (
                        f"{FIRMWARE_REPO} has no releases, or it is private and "
                        f"needs a github_token"
                    )
                    self._save()
                    return False
                response.raise_for_status()
                release = await response.json()

            version = release.get("tag_name") or release.get("name")
            assets = [
                one
                for one in release.get("assets", [])
                if str(one.get("name", "")).endswith(".bin")
            ]
            if not version or not assets:
                self.state["error"] = f"Release {version} has no .bin attached"
                self._save()
                return False

            # An asset per model, by name. A release from before the firmware
            # built for two boards has one unnamed binary, and it is the model
            # this add-on was told about -- which is what it always was.
            wanted: dict[str, dict[str, Any]] = {}
            for asset in assets:
                if asset.get("size", 0) > MAX_BYTES:
                    log.warning("Ignoring %s: too large to be firmware", asset["name"])
                    continue
                wanted[model_in(asset["name"]) or LEGACY_MODEL] = asset

            if not wanted:
                self.state["error"] = f"Release {version} has no usable .bin attached"
                self._save()
                return False

            if self.state.get("version") == version and all(
                self.have_binary(model) for model in wanted
            ):
                return False  # already held, every build of it

            log.info(
                "Downloading firmware %s for %s", version, ", ".join(sorted(wanted))
            )
            payloads = {
                model: await self._download_asset(session, asset)
                for model, asset in wanted.items()
            }

        os.makedirs(FIRMWARE_DIR, exist_ok=True)
        builds: dict[str, Any] = {}
        for model, payload in payloads.items():
            with open(self.binary_path(model), "wb") as handle:
                handle.write(payload)
            builds[model] = {
                "bytes": len(payload),
                # The device checks this before making the image bootable, so a
                # transfer that went wrong never gets run.
                "sha256": hashlib.sha256(payload).hexdigest(),
                "asset": wanted[model]["name"],
            }

        self.state = {
            "version": version,
            "builds": builds,
            "notes": (release.get("body") or "")[:2000],
            "published": release.get("published_at"),
            "error": None,
        }
        self._save()
        log.info(
            "Holding firmware %s: %s",
            version,
            ", ".join(f"{model} ({build['bytes']} bytes)" for model, build in builds.items()),
        )
        return True

    @staticmethod
    async def _download_asset(session: aiohttp.ClientSession, asset: dict[str, Any]) -> bytes:
        """Fetch a release asset, private repo or not.

        browser_download_url only works for a public repo. For a private one the
        bytes come from the asset API with Accept: octet-stream, which redirects
        to storage -- and the Authorization header must not follow, or the
        storage host rejects it. So the redirect is taken manually.
        """
        if not FIRMWARE_TOKEN:
            async with session.get(asset["browser_download_url"], timeout=180) as response:
                response.raise_for_status()
                return await response.read()

        async with session.get(
            asset["url"],
            headers={"Accept": "application/octet-stream"},
            allow_redirects=False,
            timeout=180,
        ) as response:
            if response.status in (301, 302, 307):
                location = response.headers["Location"]
                # A separate session, so no Authorization header goes with it
                async with aiohttp.ClientSession() as plain:
                    async with plain.get(location, timeout=180) as redirected:
                        redirected.raise_for_status()
                        return await redirected.read()
            response.raise_for_status()
            return await response.read()

    def shared_model(self, behind: list[str]) -> str:
        """Which build the one shared, legacy offer carries.

        There is a single `<root>/firmware/manifest`, it can name one model, and
        firmware old enough to read only that topic *clears* an offer whose
        model is not its own. So handing it to the wrong board does not merely
        fail to help one panel -- it takes the offer away from another.

        The rule, in order:

          - A panel of the legacy model is behind: the topic is its, because any
            panel that depends on this topic at all is one of those.
          - Otherwise some other board is behind and the legacy ones are not:
            the topic is that board's, which is how the first panel of a new
            model gets its first update without a cable.
          - Nobody is behind: the legacy model, so a panel arriving later on old
            firmware finds something it can read.

        `behind` is the models of the panels that are not running what is held.
        Decided from the panels the add-on can see rather than from a setting:
        an add-on that knows every panel's model has no business asking.
        """
        if not behind or LEGACY_MODEL in behind:
            return LEGACY_MODEL
        # Sorted so two boards behind at once is a stable answer rather than a
        # topic that flips between them on every publish.
        return sorted(behind)[0]

    def manifest(self, base_url: str, model: str | None = None) -> dict[str, Any]:
        """What one panel needs to decide whether to update, and where from.

        Empty when there is no build for that model, which is the honest answer:
        a panel offered another board's image would refuse it anyway, and an
        empty offer is what stops the editor showing an Update button for it.
        """
        wanted = model or LEGACY_MODEL
        build = self.builds().get(wanted)
        if not build or not self.have_binary(wanted) or not base_url:
            return {}
        return {
            "version": self.state["version"],
            "url": f"{base_url.rstrip('/')}/{binary_name(wanted)}",
            "bytes": build["bytes"],
            "sha256": build["sha256"],
            # Which panel it is for. The firmware refuses an offer that is not
            # its own, whichever topic it arrived on.
            "model": wanted,
        }


store = FirmwareStore()
