"""Checks the add-on's half of the photo album feature.

Not committed, same as the other harnesses here. What it pins is the part that
is invisible from reading either repo on its own: **the filename a photo widget
looks for**. The firmware derives it in PhotoCard::variantPrefix and the add-on
derives it in albums.Variant.prefix, neither tells the other, and if they
disagree by one character every photo widget silently draws ALBUM IS EMPTY.

The expected strings below were taken from the *firmware* side -- they are the
files sim/check.sh renders from, which the real PhotoCard found by building the
name itself. So this asserts the add-on still agrees with something the panel
has actually read.

Also covers the two pure functions in icloud.py, which are the ones that can be
tested without an album: the link parsing, and choosing which size of a photo to
download.
"""

import os
import sys
import tempfile

ROOT = os.path.expanduser(
    "~/Documents/Ich/Development/Arduino/inkplate5v2/ha-inkplate-dashboard/dashboard/backend"
)
sys.path.insert(0, ROOT)
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp())

import albums
import grids  # noqa: E402
import icloud  # noqa: E402

passes = 0
failures = 0


def check(condition, description):
    global passes, failures
    if condition:
        passes += 1
        print(f"ok   {description}")
    else:
        failures += 1
        print(f"FAIL {description}")


def page(widgets, chip_row="bottom"):
    return {"pages": [{"id": "p", "chip_row": chip_row, "widgets": widgets}]}


def photo(size="3x2", **options):
    return {"type": "photo", "size": size, "options": {"album": "demo", **options}}


print("--- the names the firmware actually reads ---")
# Every one of these is a file in the firmware repo's sim/sdcard, put there by
# this module and found by PhotoCard building the same string. Changing either
# side without the other breaks exactly here.
check(
    albums.Variant("demo", 704, 374, fill=True, border=True).name(0)
    == "demo_704x374_fb_000",
    "3x2, cropped to fill, framed",
)
check(
    albums.Variant("demo", 704, 374, fill=True, border=False).name(0)
    == "demo_704x374_fn_000",
    "3x2, no frame",
)
check(
    albums.Variant("demo", 704, 374, fill=False, border=True).name(0)
    == "demo_704x374_tb_000",
    "3x2, fitted rather than cropped",
)
check(
    albums.Variant("demo", 457, 576, fill=True, border=True).name(1)
    == "demo_457x576_fb_001",
    "2x3, and the index is zero padded to three digits",
)

print("--- the picture is inset into the frame, or is not ---")
# With a border the firmware draws a card and puts the picture in its body, so
# the picture is CARD_BORDER smaller on each edge and rounded to the body's own
# curve. Without one it runs to the edge with square corners. Getting this wrong
# shows as white crescents in the corners, or a picture 8px too big.
framed = albums.Variant("demo", 704, 374, fill=True, border=True)
plain = albums.Variant("demo", 704, 374, fill=True, border=False)
check(framed.photo_size == (696, 366), "a framed picture is inset by 4 on every edge")
check(framed.radius == 12, "and rounded to the card body's radius, not the card's")
check(plain.photo_size == (704, 374), "an unframed one takes the whole footprint")
check(plain.radius == 0, "with square corners")

print("--- full screen with no border bleeds to the physical edges ---")
# PhotoCard's one exception: with nothing else on the page and no frame to sit
# inside, the firmware runs a 5x3 photo to the panel's own edges rather than
# the usual 30px grid margin -- so the picture rendered here has to be the
# whole 1280x720 panel too, or the firmware just centres an undersized image
# in the bigger box, which is the same white border this exists to remove.
# full_screen is carried on the Variant rather than worked out by comparing its
# box against one panel's full-screen box: with two shapes of panel there is no
# single such box, and 1198x576 is full screen on a V2 and off the edge of a V1.
# variants_in sets it from the grid of the panel the widget is on.
full_bleed = albums.Variant("demo", 1198, 576, fill=True, border=False, full_screen=True)
full_framed = albums.Variant("demo", 1198, 576, fill=True, border=True, full_screen=True)
with_chip_row = albums.Variant("demo", 1198, 576, fill=True, border=False)
check(full_bleed.photo_size == (1280, 720), "no border, full grid, chip row off")
check(
    full_framed.photo_size == (1190, 568),
    "the same box with a border keeps the ordinary inset instead",
)
check(
    with_chip_row.photo_size == (1198, 576),
    "a chip row shrinks the box, so this is not the full-screen case",
)

print("--- what the layout asks for ---")
check(albums.variants_in(page([photo()])) == {framed}, "one widget, one variant")
check(
    albums.variants_in(page([photo(), photo()])) == {framed},
    "two identical widgets still only need one set of pictures",
)
check(
    len(albums.variants_in(page([photo(), photo(crop="fit")]))) == 2,
    "but a different crop is a different set",
)
check(
    len(albums.variants_in(page([photo(), photo(border="off")]))) == 2,
    "and so is a different border",
)
check(
    len(albums.variants_in(page([photo("3x2"), photo("2x3")]))) == 2,
    "and so is a different size",
)
check(albums.variants_in(page([photo(album="")])) == set(), "an album left unset asks for nothing")
check(
    albums.variants_in({"pages": [{"widgets": [{"type": "clock"}]}]}) == set(),
    "and a layout with no photo widget asks for nothing",
)

print("--- a page keeps an arrangement per shape ---")
# Each is drawn on a different grid, so a photo widget wants a different picture
# in each -- and a widget that exists only in the sideways arrangement still
# needs its pictures rendered, or turning the panel shows ALBUM IS EMPTY until
# the next refresh gets round to it.
PORTRAIT = grids.from_manifest(
    {"grid": {"gap": 22, "gap_x": 22, "gap_y": 22, "margin_x": 23, "margin_y": 23,
              "unit_w": 210, "unit_h": 172, "unit_h_off": 172, "cols": 3, "rows": 6,
              "chip_h": 70},
     "display": {"width": 720, "height": 1280}}
)

both_ways = {"pages": [{
    "id": "p", "chip_row": "bottom",
    "widgets": [photo("3x2")],
    "widgets_portrait": [photo("2x2")],
}]}

upright = albums.variants_in(both_ways, grids.V2)
sideways = albums.variants_in(both_ways, PORTRAIT)
check(
    {v.name(0) for v in upright} == {"demo_704x374_fb_000"},
    f"the upright grid asks for the upright arrangement's photo ({[v.name(0) for v in upright]})",
)
check(
    {v.name(0) for v in sideways} == {"demo_442x366_fb_000"},
    f"and the sideways grid for the sideways one's ({[v.name(0) for v in sideways]})",
)
check(
    upright.isdisjoint(sideways),
    "which are different pictures, because the grids are different sizes",
)

# A page with no sideways arrangement is drawn from the upright one bent onto
# the other grid, so it wants that grid's sizes of the same photos.
one_way = {"pages": [{"id": "p", "chip_row": "bottom", "widgets": [photo("2x2")]}]}
check(
    {v.name(0) for v in albums.variants_in(one_way, PORTRAIT)} == {"demo_442x366_fb_000"},
    "a page with no sideways arrangement still wants sideways pictures",
)

# The two sizes that exist only for a panel on its side. 3x6 is the whole of a
# V2 standing up, so with no frame and no chip row it bleeds to the glass the
# way 5x3 does lying down; 2x4 is a tall card. Both names are files in the
# firmware's sim/sdcard, drawn by its portrait-photo goldens.
full = albums.variants_in(
    {"pages": [{"id": "p", "chip_row": "off",
                "widgets_portrait": [photo("3x6", border="off")]}]}, PORTRAIT)
check(
    {v.name(0) for v in full} == {"demo_674x1142_fn_000"},
    f"a sideways 3x6 is named for its grid box ({[v.name(0) for v in full]})",
)
check(
    [(v.full_screen, v.photo_size) for v in full] == [(True, (720, 1280))],
    f"and is the full screen, rendered at the glass ({[(v.full_screen, v.photo_size) for v in full]})",
)
# Full screen, which is no count of cells: the whole glass on whichever grid,
# named for the panel's own pixels, never framed however the option is set, and
# the same with a chip row as without.
for grid, name in ((grids.V2, "demo_1280x720_fn_000"), (PORTRAIT, "demo_720x1280_fn_000")):
    for row in ("bottom", "off"):
        got = albums.variants_in(
            {"pages": [{"id": "p", "chip_row": row, "widgets": [photo("full", border="on")]}]}, grid)
        check(
            [(v.name(0), v.photo_size) for v in got] == [(name, (grid.width, grid.height))],
            f"full screen on {grid.width}x{grid.height}, chip row {row}: {[(v.name(0), v.photo_size) for v in got]}",
        )

tall = albums.variants_in(
    {"pages": [{"id": "p", "chip_row": "bottom", "widgets_portrait": [photo("2x4")]}]}, PORTRAIT)
check(
    {v.name(0) for v in tall} == {"demo_442x754_fb_000"},
    f"a sideways 2x4 is a framed card like any other ({[v.name(0) for v in tall]})",
)

print("--- the chip row no longer changes the height ---")
# It used to: a page with no chip row gave its rows the height the row would
# have taken, 200 rather than 166, which made the same widget a different
# footprint and so a second set of pictures to render and store.
#
# Since the shared cell there is one height, 172, and a page without a row
# centres its cards in what the row gives back instead of growing them. So both
# pages want the *same* pictures -- which is worth a check of its own, because
# the saving is real: an album on a mixed layout used to be rendered twice.
with_row = albums.variants_in(page([photo("3x2")], chip_row="bottom"))
without = albums.variants_in(page([photo("3x2")], chip_row="off"))
check(next(iter(with_row)).height == 374, "a 3x2 is 374 tall with a chip row")
check(next(iter(without)).height == 374, "and the same without one")
check(with_row == without, "so one set of pictures serves both kinds of page")

print("--- choosing which photographs to show ---")
# The picker's half of the contract. What matters is not which photos come back
# but the *order*: position in this list is the number in the device's
# filenames, so it has to follow the album's own oldest-first order and never
# the order the boxes were ticked in.
available = [
    {"guid": f"g{n}", "checksum": f"c{n}", "created": f"2026-09-0{n}"} for n in range(5)
]
guids = lambda picked: [one["guid"] for one in picked]  # noqa: E731

check(
    guids(albums.chosen({"limit": 3}, available)) == ["g0", "g1", "g2"],
    "no selection falls back to the limit, as every album did before the picker",
)
check(
    guids(albums.chosen({"selected": ["g3", "g1"]}, available)) == ["g1", "g3"],
    "a selection is returned in the album's order, not the order it was ticked",
)
check(
    guids(albums.chosen({"selected": ["g4", "g0", "g2"]}, available)) == ["g0", "g2", "g4"],
    "and that holds however the selection is written",
)
check(
    guids(albums.chosen({"selected": ["g1", "gone"]}, available)) == ["g1"],
    "a photo deleted from the album drops out without rewriting the selection",
)
# An album whose photos were all replaced would otherwise render nothing, and a
# photo widget with nothing to draw says ALBUM IS EMPTY on the panel.
check(
    guids(albums.chosen({"selected": ["vanished"], "limit": 2}, available)) == ["g0", "g1"],
    "a selection matching nothing falls back to the limit rather than to nothing",
)

check(albums._clean_selection(None) is None, "no selection is not the same as an empty one")
check(albums._clean_selection(["a", "b", "a"]) == ["a", "b"], "duplicates are dropped")
for bad, why in (([], "an empty list"), (["", "  "], "a list of nothing")):
    try:
        albums._clean_selection(bad)
        check(False, f"{why} is refused")
    except albums.AlbumError:
        check(True, f"{why} is refused")

print("--- reading the share link ---")
check(
    icloud.token_from_url("https://www.icloud.com/sharedalbum/#B0exampleToken1")
    == "B0exampleToken1",
    "the ordinary link",
)
check(
    icloud.token_from_url("  https://www.icloud.com/sharedalbum/#B0exampleToken1  ")
    == "B0exampleToken1",
    "with the whitespace a paste brings",
)
check(icloud.token_from_url("B0exampleToken1") == "B0exampleToken1", "a bare token")
check(
    icloud.token_from_url("https://share.icloud.com/photos/B0exampleToken1")
    == "B0exampleToken1",
    "the newer form, with the token in the path",
)
for bad, why in (
    ("", "nothing pasted"),
    # Taken as the token 'holiday' before the host was checked, which then
    # failed as 'iCloud does not know this album' and sent the user to look at
    # their sharing settings instead of at what they had pasted.
    ("https://example.com/holiday", "a link to something else"),
    ("https://www.icloud.com/sharedalbum/#not a token", "a token with a space in it"),
):
    try:
        icloud.token_from_url(bad)
        check(False, f"{why} is refused")
    except icloud.AlbumError:
        check(True, f"{why} is refused")

print("--- which size of a photo to download ---")
def derivative(width, checksum="c"):
    return {"width": width, "height": int(width * 2 / 3), "checksum": checksum, "fileSize": width}

# The original is often 4000px, which is megabytes of detail that a crop and a
# one-bit dither throw away. The smallest that still covers the panel wins.
best = icloud._best_derivative(
    {"a": derivative(640, "a"), "b": derivative(1600, "b"), "c": derivative(4032, "c")}
)
check(best["checksum"] == "b", "the smallest derivative at least as wide as the panel")
# But an album of small pictures must still show something.
small = icloud._best_derivative({"a": derivative(320, "a"), "b": derivative(640, "b")})
check(small["checksum"] == "b", "falling back to the largest when none is big enough")
check(icloud._best_derivative({}) is None, "a photo with no derivatives is skipped")
check(
    icloud._best_derivative({"a": {"width": 0, "height": 0, "checksum": "a"}}) is None,
    "and so is one whose only derivative has no size",
)

print("--- a refresh, against a fake iCloud ---")
# The real thing needs a shared album and minutes of dithering. What matters
# here is the bookkeeping around it: which names get written, which get swept,
# and that an unchanged album is not re-rendered -- that last one is what keeps
# the panel from re-downloading every picture over WiFi on every poll.
import asyncio  # noqa: E402
import io  # noqa: E402

import images  # noqa: E402
from PIL import Image  # noqa: E402


def fake_photo() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (1600, 1067), (128, 128, 128)).save(buffer, format="JPEG")
    return buffer.getvalue()


PHOTO_BYTES = fake_photo()
downloads = {"count": 0}


async def fake_read(token):
    return {
        "name": "Demo",
        "photos": [
            {
                "guid": f"g{n}",
                "checksum": ALBUM_STATE["checksums"][n],
                "width": 1600,
                "height": 1067,
                "created": f"2026-09-0{n + 1}",
                "caption": "",
                "url": f"https://example.invalid/{n}",
            }
            for n in range(ALBUM_STATE["count"])
        ],
    }


async def fake_download(session, url):
    downloads["count"] += 1
    return PHOTO_BYTES


ALBUM_STATE = {"count": 3, "checksums": ["c0", "c1", "c2", "c3"]}
icloud.read = fake_read
icloud.download = fake_download

albums._save({"demo": {"id": "demo", "name": "Demo", "token": "t", "limit": 25}})

stored = lambda: {entry["name"] for entry in images.listing()}  # noqa: E731


def on_v2(layout):
    """One panel's worth of work, as refresh() now takes it.

    The pictures are one shared library across every panel, so a refresh is
    given every panel's layout with the grid it is drawn against. These checks
    are all about one panel, so they wrap theirs.
    """
    return [(grids.V2, layout)]

layout_3x2 = page([photo("3x2")])
asyncio.run(albums.refresh(on_v2(layout_3x2)))
check(
    stored() == {"demo_704x374_fb_000", "demo_704x374_fb_001", "demo_704x374_fb_002"},
    "a refresh renders one picture per photo, for the one variant asked for",
)

# The whole point of recording the source checksum. Without it every poll would
# re-render everything, every blob's hash would change, and the panel would
# re-download the album several times a day.
downloads["count"] = 0
asyncio.run(albums.refresh(on_v2(layout_3x2)))
check(downloads["count"] == 0, "a second refresh with nothing changed downloads nothing")
check(len(stored()) == 3, "and leaves the pictures alone")

# The bug this exists to catch: PhotoCard::fullBleed changed what pixels a
# variant renders at without changing its *name* (the name is still the grid
# box -- see photo_size), so a picture rendered before that change has the
# right name and the right source checksum and was never re-rendered by it.
# Simulated here by corrupting one stored entry's size behind the index's
# back, the same shape a pre-fix render actually left on disk.
index = images._load_index()
index["demo_704x374_fb_001"]["width"] = 100
index["demo_704x374_fb_001"]["height"] = 100
images._save_index(index)
downloads["count"] = 0
asyncio.run(albums.refresh(on_v2(layout_3x2)))
check(
    downloads["count"] == 1,
    "a stored render at the wrong size is redone even though its source photo has not changed",
)
check(
    images._load_index()["demo_704x374_fb_001"]["width"] == 696,
    "and comes back at the size the variant actually calls for -- 696, not the "
    "704x374 in its name, since this one is framed and photo_size insets it",
)

# A photo added on someone's phone. Oldest-first ordering means it lands at the
# end, so the existing three keep their names and the panel only fetches the new
# one -- the reason the ordering is what it is.
ALBUM_STATE["count"] = 4
downloads["count"] = 0
asyncio.run(albums.refresh(on_v2(layout_3x2)))
check(downloads["count"] == 1, "adding a photo downloads only the new one")
check("demo_704x374_fb_003" in stored(), "which is appended rather than renumbering the rest")

# Resizing the widget is a different footprint, so it is a different set of
# pictures -- and the old set has to go, or the card fills up with blobs nothing
# will ever draw.
asyncio.run(albums.refresh(on_v2(page([photo("2x3")]))))
check(
    stored() == {f"demo_457x576_fb_{n:03d}" for n in range(4)},
    "resizing the widget renders the new shape and sweeps the old one",
)

# An album nothing shows any more. Its pictures have to stop being advertised,
# or the device keeps them on its card forever.
albums._save({})
asyncio.run(albums.refresh(on_v2(page([photo("2x3")]))))
check(stored() == set(), "removing the album sweeps every picture it owned")

print("--- a refresh never deletes what it cannot account for ---")
# The 2026-09-14 fault: 25 rendered photos were swept in a single pass, the
# panel drew ALBUM IS EMPTY, and nothing rendered them again. The prune treated
# one refresh as the whole truth, so any pass that failed to see the album for
# any reason was read as "nothing wants these".
albums._save({"demo": {"id": "demo", "name": "Demo", "token": "t", "limit": 25}})
ALBUM_STATE["count"] = 3
asyncio.run(albums.refresh(on_v2(layout_3x2)))
full = stored()
check(len(full) == 3, "three pictures rendered to start from")

# 1. iCloud answers with an empty album. Indistinguishable from a read that
#    failed quietly, so the pictures stay.
ALBUM_STATE["count"] = 0
asyncio.run(albums.refresh(on_v2(layout_3x2)))
check(stored() == full, "an album that comes back empty keeps its pictures")

# 2. iCloud refuses outright.
async def refuse(token):
    raise icloud.AlbumError("iCloud does not know this album.")

good_read, icloud.read = icloud.read, refuse
asyncio.run(albums.refresh(on_v2(layout_3x2)))
check(stored() == full, "an album iCloud refuses keeps its pictures")
icloud.read = good_read

# 3. The layout momentarily has no photo widget -- mid-edit, or a widget being
#    dragged between pages. Nothing is known about the album, so nothing goes.
ALBUM_STATE["count"] = 3
asyncio.run(albums.refresh(on_v2({"pages": [{"id": "p", "widgets": []}]})))
check(stored() == full, "a layout with no photo widget keeps the album's pictures")

# 4. And the widget comes back to pictures that are still there.
check(albums.starved(on_v2(layout_3x2)) == [], "so the widget is not starved")

# But a deleted album is someone's intent, and must still be swept.
albums._save({})
asyncio.run(albums.refresh(on_v2(layout_3x2)))
check(stored() == set(), "deleting the album does still sweep its pictures")

print("--- starvation is noticed, so the poll can come back sooner ---")
albums._save({"demo": {"id": "demo", "name": "Demo", "token": "t", "limit": 25}})
check(
    albums.starved(on_v2(layout_3x2)) == ["demo_704x374_fb_"],
    "a widget with no pictures rendered is reported as starved",
)
asyncio.run(albums.refresh(on_v2(layout_3x2)))
check(albums.starved(on_v2(layout_3x2)) == [], "and is not, once a refresh has run")
check(len(stored()) == 3, "which rendered them again without the layout changing")

print("--- the race that actually deleted a panel's album ---")
# store.save() opened layout.json with "w", truncating it before writing. The
# album refresh runs as a background task and re-read the layout from disk, so
# it could land in that window, get a JSONDecodeError, and be handed an EMPTY
# layout by store.load(). It then concluded nothing wanted the 25 rendered
# pictures and deleted them. Confirmed from the add-on log: "0 rendered, 25
# dropped", instantly, right after a PUT /api/layout.
import json  # noqa: E402
import threading  # noqa: E402
import time  # noqa: E402

import store  # noqa: E402

# A panel to file it under. Every store call is per panel now -- each panel has
# its own dashboard -- so the race is reproduced against one panel's file, which
# is the file the real one truncated.
PANEL = "inkplate-a864a0"

real_layout = page([photo("3x2")])
real_layout["version"] = 1
store.save(PANEL, real_layout)
check(store.load(PANEL).get("pages") != [], "the layout round-trips through the store")

# Racing it by hammering proves nothing -- the write is far too fast to land in,
# and the naive version passed that test every time. So the window is held open
# instead: json.dump is made to write half the document, pause, then finish, and
# a reader goes in during the pause. That is deterministic, and it fails against
# the truncating save exactly as the real panel did.
real_dump = json.dump


def halfway_dump(obj, handle, **kwargs):
    text = json.dumps(obj, **kwargs)
    middle = len(text) // 2
    handle.write(text[:middle])
    handle.flush()
    time.sleep(0.3)
    handle.write(text[middle:])


# Asserted on the *variants*, not on layout["pages"]. store.load()'s fallback is
# EMPTY_LAYOUT, which has a page in it -- an empty one -- so "pages is truthy"
# passes against the broken save and proves nothing. What the refresh actually
# reads is which photo widgets exist, and that is what went missing.
seen_during_save = {}


def save_slowly():
    json.dump = halfway_dump
    try:
        store.save(PANEL, real_layout)
    finally:
        json.dump = real_dump


writer = threading.Thread(target=save_slowly, daemon=True)
writer.start()
time.sleep(0.12)  # land in the middle of the write
seen_during_save["variants"] = albums.variants_in(store.load(PANEL))
writer.join(timeout=5)

check(
    seen_during_save["variants"] != set(),
    "a layout read halfway through a save still has its photo widget",
)
check(
    albums.variants_in(store.load(PANEL)) != set(),
    "and so does the finished layout",
)

# And the belt-and-braces: even handed an empty layout, the prune leaves a
# configured album's pictures alone.
albums._save({"demo": {"id": "demo", "name": "Demo", "token": "t", "limit": 25}})
ALBUM_STATE["count"] = 3
asyncio.run(albums.refresh(on_v2(layout_3x2)))
before = stored()
asyncio.run(albums.refresh({}))
check(stored() == before, "and an empty layout could not delete them anyway")

print("--- a change during a refresh is not lost ---")
# "A refresh is already running; skipping this one" dropped the edit that asked
# for it. A refresh takes minutes and an editing session makes several changes a
# minute, so the change lost is the last one -- the one the user is watching for.
seen: list[str] = []


async def overlapping():
    slow = asyncio.create_task(albums.refresh(on_v2(layout_3x2)))
    await asyncio.sleep(0)  # let it take the lock
    # Arrives mid-flight, and asks for a different shape.
    await albums.refresh(on_v2(page([photo("2x3")])))
    await slow
    seen.extend(sorted(stored()))


asyncio.run(overlapping())
check(
    any(name.startswith("demo_457x576") for name in seen),
    "a layout arriving mid-refresh is rendered rather than dropped",
)

print("--- the picker's thumbnails, through the real HTTP route ---")
# Driven through the app rather than by calling albums.thumbnail(), because the
# failure this exists to catch was invisible from either side on its own: the
# thumbnail is written into a directory per album, and only the *parent* was
# being created, so every write failed with ENOENT and every tile in the picker
# came back 404. The WebKit pass could not see it -- it stubs this route -- and
# the album checks above never fetched a thumbnail at all.
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)
thumb_downloads = {"count": 0}


async def counting_download(session, url):
    thumb_downloads["count"] += 1
    return PHOTO_BYTES


icloud.download = counting_download

answer = client.get("/api/albums/demo/photos")
check(answer.status_code == 200, "the picker can read an album")
listed = answer.json()["photos"]
check(len(listed) == ALBUM_STATE["count"], "and is offered every photo in it, not just the rendered ones")
check(
    [one["guid"] for one in listed] == sorted((one["guid"] for one in listed), reverse=True),
    "newest first, which is the opposite of the order the device numbers by",
)

first = listed[0]["guid"]
shot = client.get(f"/api/albums/demo/photos/{first}/thumb.jpg")
check(shot.status_code == 200, "a thumbnail is served rather than 404ing")
check(shot.headers.get("content-type") == "image/jpeg", "as a JPEG")
check(len(shot.content) > 0, "with bytes in it")

thumb_downloads["count"] = 0
client.get(f"/api/albums/demo/photos/{first}/thumb.jpg")
check(thumb_downloads["count"] == 0, "and is cached, so iCloud is asked once per photo")

check(
    client.get("/api/albums/demo/photos/nosuch/thumb.jpg").status_code == 404,
    "a photo that is not in the album is a 404, not a traceback",
)

icloud.download = fake_download

print("--- uploads are never swept ---")
# The sweep is by predicate over the whole image index, so an upload that is not
# an album's must survive it. Getting this wrong would delete pictures the user
# chose by hand, which is not recoverable -- the editor keeps no original.
#
# Back to an empty album set first: the section above deliberately leaves
# pictures rendered, and this one is about what happens to an upload when
# everything else goes.
albums._save({})
asyncio.run(albums.refresh(on_v2(layout_3x2)))
images.store_photo("byhand", PHOTO_BYTES, 100, 100, True, 0, "atkinson", album="")
asyncio.run(albums.refresh(on_v2(page([photo("2x3")]))))
check(stored() == {"byhand"}, "an uploaded image survives an album sweep")
check(images.uploads()[0]["name"] == "byhand", "and is what the Images tab lists")
check(
    [entry["name"] for entry in images.listing() if entry.get("album")] == [],
    "while the album listing is empty",
)

print("--- the manifest the device gets ---")
manifest = images.manifest("http://host:8098")
check(
    set(manifest["images"][0]) == {"name", "width", "height", "bytes", "sha256"},
    "carries only the fields the firmware reads, not the editor's",
)

print(f"\n{passes + failures} checks, {'all album checks passed' if not failures else 'SOME FAILED'}")
sys.exit(1 if failures else 0)
