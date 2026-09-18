"""The device's capability manifest, however it arrived.

The panel describes everything it can draw in one JSON document, and the
editor's whole palette is built from it. It used to come over MQTT as a single
retained publish -- and that is what broke: at 17KB the panel could not reliably
push it through one TCP write. The write would stall for ten seconds, leave half
a packet in the stream and take the broker session with it, so the boot that was
supposed to announce the panel's abilities was the boot that made it
unreachable.

It is POSTed to the device HTTP port now, which is the same port the panel
already fetches images and firmware from and already uploads its boot log to.
HTTP does not care how big the body is; the socket is written and read
incrementally by both ends, which is exactly what a 15KB payload needs and what
one MQTT packet cannot offer.

MQTT still works and is still read. Older firmware knows no other way, and the
broker's retained copy is what carries a manifest across an add-on restart when
the panel is asleep. Both paths write through here, so there is one answer to
"what can the panel draw" rather than two that can disagree.

A file rather than memory because the two are in different processes: the device
port runs as its own uvicorn (see device_api.py) and shares only DATA_DIR with
the editor.

One file per panel. Two panels of different shapes describe different grids --
5x3 cells of 220x166 against 4x2 of 215x194 -- and a single stored manifest
meant whichever panel booted last retuned the editor for all of them. That is
not hypothetical: it is what a V1 did to a V2's editor the first time both were
on one broker.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from settings import DATA_DIR

log = logging.getLogger("inkplate.manifest")

# What a single-panel install left behind. Read as a fallback so that an
# existing editor keeps its palette until the panel next boots and posts one of
# its own; never written.
LEGACY_PATH = os.path.join(DATA_DIR, "manifest.json")


def path(panel_id: str) -> str:
    return os.path.join(DATA_DIR, f"manifest-{panel_id}.json")

# Comfortably above the real thing (17,067 bytes at its largest, 14,904 once the
# firmware started sharing its value lists) and far below anything that would be
# worth worrying about. This route is unauthenticated like the rest of the
# device port, so what arrives is not necessarily what the panel sent.
MAX_BYTES = 512 * 1024


class ManifestError(ValueError):
    """What arrived is not a manifest."""


def parse(raw: str | bytes) -> dict[str, Any]:
    """Validate and return, or raise ManifestError.

    Strict on purpose. A manifest that parses but describes nothing gives the
    editor an empty palette, which reads to the user as a broken add-on rather
    than as a bad upload -- so it is refused here where it can be logged and
    answered with a 400.
    """
    if isinstance(raw, bytes):
        if len(raw) > MAX_BYTES:
            raise ManifestError(f"Manifest too large ({len(raw)} bytes)")
        raw = raw.decode("utf-8", errors="replace")
    elif len(raw) > MAX_BYTES:
        raise ManifestError(f"Manifest too large ({len(raw)} characters)")

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as problem:
        raise ManifestError(f"Not JSON: {problem}") from problem

    if not isinstance(parsed, dict):
        raise ManifestError("Not a JSON object")
    if not isinstance(parsed.get("widgets"), list) or not parsed["widgets"]:
        raise ManifestError("No widgets in it")
    return parsed


def panel_id_in(parsed: dict[str, Any]) -> str | None:
    """Which panel a manifest says it came from.

    The firmware puts it in the document, so a manifest is self-describing
    wherever it arrived from -- the MQTT path has no query string to carry it.
    """
    device = parsed.get("device")
    if isinstance(device, dict):
        found = device.get("id")
        if isinstance(found, str) and found:
            return found
    return None


def save(raw: str | bytes, panel_id: str | None = None) -> tuple[str, dict[str, Any]]:
    """Store it under the panel that sent it, and return (panel_id, manifest).

    The id in the document wins over the one the caller passed: the document is
    what the panel itself said, and the caller's is a query parameter anyone
    could have typed.
    """
    parsed = parse(raw)
    owner = panel_id_in(parsed) or panel_id
    if not owner:
        raise ManifestError("No device id in the manifest, and none given")

    os.makedirs(DATA_DIR, exist_ok=True)
    # Written beside and moved into place. The editor process reads this file
    # while the device process writes it, and a truncating write here would show
    # the editor an empty palette at exactly the moment the panel was telling it
    # otherwise. Once cost this project a photo album; see CLAUDE.md.
    destination = path(owner)
    temporary = destination + ".part"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(parsed, handle, separators=(",", ":"))
    os.replace(temporary, destination)
    return owner, parsed


# Re-read only when the file has actually changed. /api/status is polled and the
# manifest is a few thousand widgets' worth of JSON; parsing it on every poll is
# work for nothing on all but the one poll after a boot.
_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def load(panel_id: str | None) -> dict[str, Any] | None:
    """What that panel last said it could draw, or None.

    Falls back to the file a single-panel install left behind, so an editor
    opened before the panel has booted still has a palette. The fallback is a
    guess about *which* panel it described, and is only reached when that panel
    has never posted one of its own.
    """
    if not panel_id:
        return None

    for candidate in (path(panel_id), LEGACY_PATH):
        try:
            mtime = os.path.getmtime(candidate)
        except OSError:
            continue

        cached = _cache.get(candidate)
        if cached and cached[0] == mtime:
            return cached[1]

        try:
            with open(candidate, encoding="utf-8") as handle:
                parsed = json.load(handle)
        except (OSError, json.JSONDecodeError) as problem:
            # Not fatal: the panel republishes on its next boot, and an empty
            # palette with a line in the log beats a backend that will not start.
            log.warning("Could not read the stored manifest %s: %s", candidate, problem)
            continue

        _cache[candidate] = (mtime, parsed)
        return parsed

    return None
