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
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from settings import DATA_DIR

log = logging.getLogger("inkplate.manifest")

PATH = os.path.join(DATA_DIR, "manifest.json")

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


def save(raw: str | bytes) -> dict[str, Any]:
    """Store it, and return what was stored."""
    parsed = parse(raw)

    os.makedirs(DATA_DIR, exist_ok=True)
    # Written beside and moved into place. The editor process reads this file
    # while the device process writes it, and a truncating write here would show
    # the editor an empty palette at exactly the moment the panel was telling it
    # otherwise. Once cost this project a photo album; see CLAUDE.md.
    temporary = PATH + ".part"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(parsed, handle, separators=(",", ":"))
    os.replace(temporary, PATH)
    return parsed


# Re-read only when the file has actually changed. /api/status is polled and the
# manifest is a few thousand widgets' worth of JSON; parsing it on every poll is
# work for nothing on all but the one poll after a boot.
_cache: dict[str, Any] | None = None
_cached_mtime: float | None = None


def load() -> dict[str, Any] | None:
    """What the panel last said it could draw, or None."""
    global _cache, _cached_mtime
    try:
        mtime = os.path.getmtime(PATH)
    except OSError:
        return None

    if _cache is not None and _cached_mtime == mtime:
        return _cache

    try:
        with open(PATH, encoding="utf-8") as handle:
            _cache = json.load(handle)
    except (OSError, json.JSONDecodeError) as problem:
        # Not fatal: the panel republishes on its next boot, and an empty
        # palette with a line in the log beats a backend that will not start.
        log.warning("Could not read the stored manifest: %s", problem)
        return None

    _cached_mtime = mtime
    return _cache
