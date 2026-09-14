"""Read a public iCloud Shared Album.

Apple publishes no API for this. What exists is the endpoint their own web
viewer calls when you open a shared album link in a browser, and that is what
this speaks -- so the whole module rests on an interface Apple never documented
and could change without notice. It is confined to this file for that reason:
if shared albums stop working, everything that has to be rewritten is here.

**No account, no credentials, no token of ours.** Turning on "Public Website"
for an album in Photos produces a link like

    https://www.icloud.com/sharedalbum/#B0z5qAGN1JIFd3y

and the part after the hash is the album's own token. Anyone holding it can read
the album, which is the entire point of the feature. Nothing here can see any
other album, and nothing here can write.

## The conversation

Two POSTs, both to `https://<partition>-sharedstreams.icloud.com/<token>/sharedstreams/`:

    webstream      {"streamCtag": null}
                   -> the album's metadata and every photo in it, each with a
                      set of "derivatives" (the same picture at several sizes)
                      carrying a checksum, pixel size and byte count

    webasseturls   {"photoGuids": [...]}
                   -> a download URL per *checksum*, split into a host and a
                      path, and signed with an expiry

So a photo's bytes take both calls: webstream says which derivative is worth
having, webasseturls says where it is this hour. The URLs are short-lived, which
is why nothing here caches them.

## The partition redirect

Albums are spread over numbered hosts and the token does not say which. Asking
the wrong one answers **HTTP 330** with the right one in the body:

    {"X-Apple-MMe-Host": "p150-sharedstreams.icloud.com"}

That is not a status code anything else uses and no HTTP client follows it, so
it is handled by hand in `_post` below. p23 is the conventional first guess; the
partition that answers is remembered for the life of the process, because it
does not change for a given album.
"""

import asyncio
import logging
from typing import Any
from urllib.parse import urlparse

import aiohttp

log = logging.getLogger(__name__)

# The guess everyone starts from. Wrong for most albums, and being wrong costs
# one extra request the first time each album is read.
DEFAULT_PARTITION = "p23"

# Apple's own answer to "you asked the wrong host". Not a redirect any client
# knows how to follow -- 3xx without a Location header -- so it is read as data.
PARTITION_REDIRECT = 330

# webasseturls takes a batch of guids. Apple's viewer asks in chunks rather than
# for a whole album at once, and a very large album would otherwise make one
# request big enough to be refused.
GUID_BATCH = 25

# Nothing here should ever hang the add-on: every call is bounded, and a slow
# album shows up as an album that did not refresh rather than as a dashboard
# that stopped responding.
TIMEOUT = aiohttp.ClientTimeout(total=60, connect=15)

# How wide a derivative has to be before it is worth fetching. The panel is
# 1280 across and every picture is cropped down to a widget, so anything wider
# is bytes spent on detail the dither will destroy. Above this the *smallest*
# derivative that still clears the bar wins.
USEFUL_WIDTH = 1280


class AlbumError(RuntimeError):
    """Raised for anything the user can fix by pasting a different link."""


ADVICE = (
    "It should look like https://www.icloud.com/sharedalbum/#B0z5qAGN1JIFd3y — "
    "in Photos, share the album and turn on 'Public Website'."
)


def token_from_url(raw: str) -> str:
    """The album token out of whatever the user pasted.

    Accepts the share link in any of the forms Photos and the various share
    sheets produce, and also a bare token, because someone who has done this
    once will paste just the token the second time.
    """
    text = (raw or "").strip()
    if not text:
        raise AlbumError("Paste the album's share link.")

    # Anything that looks like a link has to be an iCloud one. Without this the
    # last path segment of any URL at all is taken as a token -- and since a
    # token is just letters and digits, https://example.com/holiday was accepted
    # and then failed much later as 'iCloud does not know this album', which
    # sends the user off to check their sharing settings for no reason.
    if "://" in text or text.lower().startswith("www."):
        parsed = urlparse(text if "://" in text else f"https://{text}")
        host = (parsed.hostname or "").lower()
        if host != "icloud.com" and not host.endswith(".icloud.com"):
            raise AlbumError(f"'{raw}' is not an iCloud link. {ADVICE}")
        # The token is the fragment in the usual link, and the last path
        # segment in the newer share.icloud.com form.
        text = parsed.fragment or parsed.path.rstrip("/").rsplit("/", 1)[-1]
    elif "#" in text:
        text = text.rsplit("#", 1)[1]

    # A share sheet sometimes tacks a query on the end of the fragment.
    text = text.split("?", 1)[0].split("&", 1)[0].strip()

    # Tokens are an opaque base62-ish string; Apple's are 15 characters but that
    # is not promised anywhere, so this only rejects what cannot be one.
    if not text or not text.isalnum():
        raise AlbumError(f"'{raw}' does not look like an iCloud shared album link. {ADVICE}")
    return text


class SharedAlbum:
    """One album, and the partition it turned out to live on."""

    def __init__(self, token: str):
        self.token = token
        self.partition = DEFAULT_PARTITION

    def _url(self, endpoint: str) -> str:
        return (
            f"https://{self.partition}-sharedstreams.icloud.com"
            f"/{self.token}/sharedstreams/{endpoint}"
        )

    async def _post(
        self, session: aiohttp.ClientSession, endpoint: str, body: dict[str, Any]
    ) -> dict[str, Any]:
        """POST, following Apple's partition redirect at most once.

        Once, not in a loop: a second 330 would mean the host it just named also
        disclaims the album, and retrying that forever is how a background task
        turns into a spin. Two hops is all the real thing ever needs.
        """
        for attempt in range(2):
            async with session.post(self._url(endpoint), json=body) as response:
                if response.status == PARTITION_REDIRECT:
                    moved = await response.json(content_type=None)
                    host = (moved or {}).get("X-Apple-MMe-Host", "")
                    partition = host.split("-", 1)[0]
                    if not partition or attempt:
                        raise AlbumError(
                            "iCloud kept redirecting this album and never served "
                            "it. Apple may have changed how shared albums work."
                        )
                    log.debug("Album %s lives on %s", self.token, partition)
                    self.partition = partition
                    continue

                if response.status == 404:
                    raise AlbumError(
                        "iCloud does not know this album. Check the link, and "
                        "that the album still has 'Public Website' turned on."
                    )
                if response.status != 200:
                    raise AlbumError(
                        f"iCloud answered {response.status} for this album."
                    )
                return await response.json(content_type=None)

        raise AlbumError("iCloud would not serve this album.")

    async def photos(self, session: aiohttp.ClientSession) -> dict[str, Any]:
        """The album: its name, and every photo with a URL to fetch it from.

        Videos are dropped. They arrive in the same list as everything else and
        there is nothing useful a 1-bit panel could do with one.
        """
        stream = await self._post(session, "webstream", {"streamCtag": None})

        wanted: list[dict[str, Any]] = []
        for item in stream.get("photos") or []:
            derivative = _best_derivative(item.get("derivatives") or {})
            if not derivative:
                continue
            wanted.append(
                {
                    "guid": item.get("photoGuid") or "",
                    "checksum": derivative.get("checksum") or "",
                    "width": int(derivative.get("width") or 0),
                    "height": int(derivative.get("height") or 0),
                    # What decides the order, and so the numbering the device
                    # downloads by. See albums.py for why that has to be stable.
                    "created": str(item.get("batchDateCreated") or item.get("dateCreated") or ""),
                    "caption": (item.get("caption") or "").strip(),
                }
            )

        wanted = [photo for photo in wanted if photo["guid"] and photo["checksum"]]

        # Oldest first, and the guid to break ties. The *order* is what the
        # device's filenames are built from, so it has to be a property of the
        # album rather than of the order Apple happened to list it in -- two
        # refreshes that disagree would renumber every picture and make the
        # panel re-download the lot.
        wanted.sort(key=lambda photo: (photo["created"], photo["guid"]))

        urls = await self._asset_urls(session, [photo["guid"] for photo in wanted])
        for photo in wanted:
            photo["url"] = urls.get(photo["checksum"], "")

        missing = [photo for photo in wanted if not photo["url"]]
        if missing:
            # Not fatal: the rest of the album is still worth showing, and a
            # checksum with no URL is usually an asset Apple is still moving.
            log.warning(
                "%d of %d photos in this album have no download URL yet",
                len(missing), len(wanted),
            )

        return {
            "name": (stream.get("streamName") or "").strip(),
            "photos": [photo for photo in wanted if photo["url"]],
        }

    async def _asset_urls(
        self, session: aiohttp.ClientSession, guids: list[str]
    ) -> dict[str, str]:
        """Checksum to download URL, for every guid given."""
        found: dict[str, str] = {}
        for start in range(0, len(guids), GUID_BATCH):
            batch = guids[start : start + GUID_BATCH]
            answer = await self._post(session, "webasseturls", {"photoGuids": batch})
            for checksum, item in (answer.get("items") or {}).items():
                location = item.get("url_location")
                path = item.get("url_path")
                if location and path:
                    found[checksum] = f"https://{location}{path}"
        return found


def _best_derivative(derivatives: dict[str, Any]) -> dict[str, Any] | None:
    """The version of a photo worth downloading.

    Apple offers each picture at several sizes. The original is often 4000px
    wide, which is megabytes spent on detail that a crop to 720x362 and a dither
    to one bit will throw away -- so this takes the *smallest* one that is still
    at least as wide as the panel, and only falls back to the largest available
    when the album has nothing that big.
    """
    usable = []
    for entry in derivatives.values():
        if not isinstance(entry, dict) or not entry.get("checksum"):
            continue
        try:
            width = int(entry.get("width") or 0)
            height = int(entry.get("height") or 0)
        except (TypeError, ValueError):
            continue
        if width <= 0 or height <= 0:
            continue
        usable.append({**entry, "width": width, "height": height})

    if not usable:
        return None

    big_enough = [entry for entry in usable if entry["width"] >= USEFUL_WIDTH]
    if big_enough:
        return min(big_enough, key=lambda entry: entry["width"])
    return max(usable, key=lambda entry: entry["width"])


async def read(token: str) -> dict[str, Any]:
    """The album behind a token, or AlbumError explaining why not."""
    album = SharedAlbum(token)
    try:
        async with aiohttp.ClientSession(timeout=TIMEOUT) as session:
            return await album.photos(session)
    except AlbumError:
        raise
    except asyncio.TimeoutError as error:
        raise AlbumError("iCloud did not answer in time.") from error
    except aiohttp.ClientError as error:
        raise AlbumError(f"Could not reach iCloud ({error}).") from error


async def download(session: aiohttp.ClientSession, url: str) -> bytes:
    """One photo's bytes."""
    async with session.get(url) as response:
        if response.status != 200:
            raise AlbumError(f"iCloud answered {response.status} downloading a photo.")
        return await response.read()
