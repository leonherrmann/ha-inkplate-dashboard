# Inkplate dashboard — Home Assistant add-on

The editor for the panel, and the only side with Home Assistant credentials.
Python/FastAPI backend + React/Vite frontend, served through HA ingress.

**Home Assistant installs this straight from `main`, so `main` must stay
shippable.** Anything that is not a simple change or a bug fix goes on a feature
branch, in *both* repos with the same branch name.

## The other half

The firmware is at
`~/Documents/Ich/Development/Arduino/inkplate5v2/ha_dashboard/ha_dashboard`
(its own `CLAUDE.md`), and **the saved memory for this work is keyed to that
directory** — start sessions there and reach this repo by path, or the memory is
not available.

**The firmware owns the widget list.** It sends a manifest of every type, size
and option; this repo renders an editor for it. Never hardcode a widget, size,
option or category list here.

**It owns the grid, too, and there is more than one.** An Inkplate 5 V2 is 5x3
cells of 220x166 on 1280x720; a V1 is 4x2 of 215x202 on 960x540. Ask
`backend/grids.py` rather than writing either down — a photo rendered for one
panel is the wrong size for the other, and a canvas drawn to one puts the
other's widgets in the wrong place.

It arrives two ways and both write through `manifest_store`: `POST
/device/manifest` on the device port, which is how current firmware sends it,
and the retained MQTT topic, for firmware that knows no other way. HTTP because
15KB in one MQTT packet is more than the panel's WiFi can reliably push. An
option's value list may be inline as `values` or name a shared one with
`values_ref`; `optionValues()` in `format.js` is the only thing that knows the
difference.

## Several panels

Every panel has its own dashboard: its own pages, widgets, sleep, rotation and
orientation. **Everything in the backend that touches one takes the panel it is
about** -- `store.load(panel_id)`, `manifest_store.load(panel_id)`,
`link.panel(panel_id)`, `reports.screenshot(panel_id)`. The editor sends
`?panel=<id>`; without it the default (the oldest known) answers, so an old link
still works.

A panel appears by announcing itself -- a retained `status` on a wildcard
subscription, or a manifest POST -- and nothing is paired or configured. What
the add-on keeps of its own is the *name*; everything else is asked of the
manifest, the layout or the live MQTT state at the point it is needed.

In the browser, `api.js` holds the selected panel and appends it to the scoped
calls, rather than forty components passing it down. Choosing one clears the
layout, the undo stack and the page selection: an edit made against the wrong
panel's grid is saved to the wrong dashboard.

An install from before this has one `layout.json` and one `manifest.json`; the
first panel to ask inherits them (`panels.claim_legacy`). Forgetting a panel
never deletes its layout -- unplugged for a fortnight and gone for good look
identical from here.

**Which board the one shared `firmware/manifest` carries is worked out, not
configured.** Firmware older than per-device topics reads only that topic, it
can name one model, and such firmware *clears* an offer whose model is not its
own -- so pointing it at the wrong board does not merely fail to help one panel,
it takes the offer away from another. `FirmwareStore.shared_model()` decides: a
legacy-model panel that is behind keeps it, otherwise a panel of another board
that is behind gets it, otherwise the legacy model. That is what lets the first
panel of a new board take its first update without a cable.

**Firmware offers are republished when a panel appears or changes version**, not
only at startup and on a new release -- `link.on_change` -> `_on_device_message`
in main.py, fingerprinted so a quiet panel costs no publishes.

**One release, a binary per board, an offer per panel.** The firmware is one
source tree compiled for two panels and the images are not interchangeable -- a
V2 image on a V1 is a framebuffer of the wrong size, recoverable only over USB.
A release carries `ha_dashboard-inkplate5v2.bin` and `-inkplate5v1.bin`;
`firmware.py` holds each under the model in its name, the device port serves
them at `/firmware-<model>.bin`, and each panel is offered the one for its own
model on its own topic. A release with a single unnamed `.bin` -- every release
before this -- is filed under `FIRMWARE_MODEL`, which is what it always was.

**Check the seam, not just the module.** Twice a fault has hidden between a
module and its caller while the module's own harness passed: `publish_firmware_state`
referred to a name from another function, and `albums.refresh()` was given bare
layouts after it started taking `(grid, layout)` pairs. Both were invisible to
harnesses that called the module directly. When a signature changes, add a check
that drives *main's* function.

## Running the checks

```sh
test-harnesses/run.sh          # backend + pure checks, about a minute
test-harnesses/run.sh --ui     # also every WebKit check against the committed dist
test-harnesses/run.sh timer    # only checks whose name contains "timer"
```

It sets up what they need on first use and keeps it: a Python 3.13 venv in
`.venv` (the `python3` on PATH is miniconda 3.8 and **cannot parse this
backend** -- `str | None` failing means the wrong interpreter, not a broken
edit), Pillow and httpx, and Playwright's WebKit. It runs everything even after
a failure and ends with the list of what failed. **A new harness goes into
`run.sh`**, or nobody runs it.

`imagecheck.py` holds the picture pipeline to an **independent implementation**
rather than to a recorded answer: the obvious pixel-by-pixel loop is written out
inside it, and the fast code has to agree with it on every shape. That is what
makes it safe to make `images.py` faster, which is worth doing -- three quarters
of a conversion turned out to be work nobody needed. `dithercheck.py` is the
other half of the same contract, against the browser.

Pillow is deliberately absent from `requirements.txt` (the Dockerfile installs
it via apk). The harnesses are in `test-harnesses/` at the root of this repo
(committed 2026-09-25; before that they lived outside both repos and were
rebuilt from scratch more than once). `npm install` there for Playwright. A
check that answers the editor's API has to match `/status(\?|$)`, not
`/status$`: since several panels the editor asks with `?panel=`, and a fake
that only matched the bare path served nothing and timed out.

**`run.sh` (it starts with `importcheck.py`) before any release** — 2026.9.29 shipped an add-on that could
not start at all because one import was wrong.

## Frontend

```sh
cd dashboard/frontend && npm install && npm run build
```

`dist/` **is committed** — the Dockerfile copies it to `/app/static`. Rebuild and
commit it with any frontend change, or the release ships the old bundle.
`npm run build` empties `dist`, so copy fixtures in afterwards.

**Test the editor in WebKit, not Chromium.** Faults here have been Safari-only
more than once, and the add-on is always inside an iframe on iOS. Use
Playwright's webkit against the built `dist` with `**/api/**` stubbed. Assert
that **nothing is wider than its window** — this stylesheet has shipped four
specificity bugs of that shape, all invisible in a static desktop render.

`run.sh --ui` serves `dist` on 8127 and runs every browser check; to run one
by hand, serve `dist` there yourself and `node test-harnesses/<x>.mjs`.

**The widget renders are per shape — each panel, each way up.** The cell is the
same 210x172 everywhere, but a card is not the same picture on a grid three
columns wide as on one five wide, and the sizes on offer differ. So there are
four sets: `src/widget-shots/` (V2 upright), `inkplate5v2-portrait/`,
`inkplate5v1/` and `inkplate5v1-portrait/`, picked by `panelModel(manifest)` and
`panelOrientation(manifest)`. All four come from the firmware repo:

```sh
python3 sim/screenshots.py ~/…/frontend/src/widget-shots
python3 sim/screenshots.py ~/…/frontend/src/widget-shots --panel v2p
python3 sim/screenshots.py ~/…/frontend/src/widget-shots --panel v1
python3 sim/screenshots.py ~/…/frontend/src/widget-shots --panel v1p
```

Run all four, or the shape you skipped keeps the renders it had. A run rewrites
every PNG even when no pixel changed; restore the ones whose pixels are
identical, or a one-line offset fix arrives as a thousand-file diff.

**A render is placed by its `dx`/`dy`, measured from where the preview drew the
widget** -- the margins for a card, the chip row for a chip. Until 2026.9.65
they were measured from the gap, so every picture sat 4px right and 8px up of
its box on a V2 lying down. `chiprowcheck.mjs` measures the drawn canvas against
the manifest's grid; nothing else compares a picture with anything but itself. `canvascheck.mjs`
compares each render against the box it is drawn in, on all of them, which is the
check that was missing when every card on the V1 came out 26px too wide.

**A widget's footprint is derived from the grid, never from the published
size.** The manifest's `sizes` carry the pixels of the shape the panel was
*standing in* when it sent the manifest -- a 2x1 is 457 wide upright and 442 on
its side, and a chip row is 56 tall against 70. The editor works on both
arrangements whichever way the panel is up, so taking the published number for
both drew every multi-cell card wide of its own cells: the cards snapped to the
right origins and then overhung them, which is what "the portrait grid does not
snap right" looks like from the outside. `widgetSize`, `variantFootprint`,
`nearestVariant` and `otherChips` all take the page's grid; pass it.

`snapcheck.mjs` is the guard: it drives layout.js from every manifest a panel
can send and measures every origin, span, snap, clamp and footprint against
`sim/host/GridDump.cpp`, which prints the firmware's own numbers. Four shapes,
three chip rows, and every combination of shape-being-edited against
shape-the-manifest-describes -- the cross cases are the real ones, and are what
a matching-orientation test misses.

**Anything picturing a page has to be told which shape it is picturing.** A page
keeps an arrangement per shape, so `page.widgets` is no longer "the widgets" --
it is the upright one. `arrangementFor(page, shape, manifest)` is the only way to
ask, and the canvas, the page thumbnails and the row counts all go through it.
Three places did not, and the worst was not cosmetic: the stranded-widget rescue
measured the *upright* arrangement against the shape being *edited*, so switching
the toolbar to sideways put every card past x=720 off a 720-wide panel -- and it
rewrites the layout without asking, in a loop. `shapecheck.mjs` asserts that
switching shapes writes nothing at all.

The canvas fits the panel's **long side**, not its width. Those are the same
number only while a panel is wider than it is tall; 720 fits any screen, so a
portrait canvas came out at 1:1. Fitting the long side also puts both shapes at
one scale, which is the truth of this grid -- the cell is 210x172 either way up,
so a card is the same size on the screen in both.

**A screenshot is always the glass's own shape**, never the shape the panel is
standing in: the library maps drawing coordinates on the way into the buffer, so
an Inkplate 5 uploads 960x540 either way up. `reports.native_frame_size()` is
what the byte count and the decode must use — reading it at the turned shape
refused a V1 on its side outright (540 is not a multiple of 8, so the expected
count was 64,320 against 64,800) and would have scrambled a V2 silently, since
720 and 1280 both divide by 8 and the count matched by luck. `shotcheck.py`
covers both panels and all four orientations.

**A page keeps an arrangement per shape**, `widgets` and `widgets_portrait`,
edited independently. The toolbar switches between them; `shapeGrid()` and
`shapePanel()` in `layout.js` read the manifest's `shapes` block, which carries
both ways the panel can stand. A page with no sideways arrangement shows the
upright one bent onto the portrait grid — `fitToShape()`, which mirrors
`LayoutFit.h` — and the first edit makes that arrangement real.

Anything that walks a layout walks **both** arrangements: `grids.shapes_of()`
returns a grid per shape and `_every_layout()` pairs each layout with each of
them, so a photo widget that exists only in the sideways arrangement still gets
its pictures rendered before the panel is turned.

**The gaps differ per axis and the margin is not the gap.** `grids.py` and
`layout.js` both read `gap_x`, `gap_y`, `margin_x` and `margin_y` from the
manifest, falling back to the single `gap` for firmware that predates the split —
on that firmware the margin *was* the gap, so the fallback is exact rather than
approximate. Never place a widget with `grid.gap` alone.

**The icon picker shows the firmware's own outlines**, copied into
`frontend/src/iconGlyphs.js` by `dashboard/tools/icon-glyphs.py` from the
firmware's `icon_svg/`. Re-run it when the firmware gains an icon. The manifest
still decides which icons *exist*, so one with no outline here still lists —
`iconcheck.mjs` opens with the comparison and names any that have drifted, which
is the alarm for the two repos having been released apart.

`/entities`, `/devices` and `/areas` answer with a **bare array**, not an
object — a stub that wraps them crashes the inspector rather than emptying it.
`editcheck.mjs` stubs `/status` with `manifest.json` next to it, which is
`./sim/preview --manifest` from the firmware repo.

**Headless WebKit reports `backdrop-filter` as supported and then does not
blur.** A screenshot showing the page legible through a glass surface is that,
not a bug — and a surface that covers a page of content cannot rely on a blur
to hide what is under it.

## Layout of the code

- `dashboard/backend/main.py` — the API. `store.py` holds the draft layout,
  `mqtt.py` the device link, `images.py` the 1-bit conversion, `albums.py` +
  `icloud.py` the photo albums, `registry.py`/`ha_bridge.py` Home Assistant.
- `dashboard/frontend/src/` — `App.jsx` owns the layout state,
  `Inspector.jsx` renders a widget's options from the manifest,
  `WidgetPreview.jsx` draws each widget on the canvas.
- **One top bar over every screen** (`TopBar.jsx`): which panel, whether it is
  online, the battery, and the push pill -- "2 changes · Push" when pressing it
  helps, a quiet state pill that opens its detail otherwise. It replaced the
  device card, the panel name over each screen and the Device screen's sync
  card, which said parts of the same thing three times.
- **The canvas toolbar is one row** (`PageBar.jsx`): Add, the arrangement,
  View and undo/redo. Snap, zoom and the page's chip row are in the View menu;
  on a phone the arrangement joins them. The four selection actions float beside
  the selected widget on a desktop (`SelectionBar` in `Panel.jsx`) and are
  behind ⋯ on the phone's edit screen.
- **Below 820px, editing a widget is a screen of its own**: `.app.editing`
  hides the top bar and the tab bar, `.workspace.editing > main` pins the edit
  head and the canvas with `position: sticky`, and the options follow in the
  page's own scroll. It replaced a bottom sheet at three heights, whose options
  scrolled in a box a few hundred pixels tall behind its own buttons.
  `editcheck.mjs` asserts the options never scroll in a box of their own.
- **A big option on that screen is a row that opens a screen**, not a control
  expanded in the list: a room card has twelve options and nobody is looking at
  eleven of them. `wantsScreen()` in `Inspector.jsx` decides, and the firmware
  says which `text` options are multi-line -- a name and a paragraph are both
  "text", and only the paragraph gets a textarea. `update_interval` is under a
  closed Advanced section everywhere.
- **Settings are sections** (`DeviceTab.jsx`): Display, Power, Timers, Panel
  actions, Diagnostics, This editor. A list beside the open one on a desktop,
  rows that open a screen on a phone. Every setting is a `Setting` from
  `Setting.jsx` -- a name, one line, an ⓘ and a control -- and a choice among a
  few values is always a segment, on/off always a switch.
- **Explanations live behind ⓘ** (`Hint` in `Popover.jsx`), not in paragraphs
  under controls: at most one short line shows. The popover is portalled and
  placed with fixed coordinates, because cards and the canvas well clip.
- **Columns on a desktop screen start level.** A heading belongs above all of a
  screen's columns, not inside one of them; `editcheck` and `devicecheck` both
  measure it.
- **The tab bar's clearance under its labels is measured, not assumed.**
  Two guesses about Home Assistant's iOS frame were both wrong on the phone.
  `fitToHost()` in `hostChrome.js` reads, off the same-origin page above,
  where the frame ends and how tall the home-indicator inset is there, and sets
  `--safe-bottom` to how much of that area the frame overlaps. **Measured on
  the iPhone app (2026-09-26): the page reports a 34px inset but stops above
  the home indicator**, and the strip under it is the app's own, painted in
  Home Assistant's `--primary-background-color` -- so the inset only counts
  when the top page reaches the screen's foot, and the tab bar takes that
  colour (when it suits the editor's theme) so bar and strip read as one.
  **Corrected the same day with a second reading: page 874 of 874**, i.e. the
  app is edge-to-edge (Home Assistant >= 2026.8), and Home Assistant itself
  reserves the inset around a custom panel, covering the frame's last 34px
  with its background (hass_ingress PR #110 describes the same). The lift is
  therefore right; the bar takes the strip's colour whenever there is an
  inset at all. **Then found exactly, by `probeHost()` on the phone: Home
  Assistant pads the frame element itself** (`iframe.loaded … pad 34`), so
  its inside stops 34px short. `unpadFrame()` cancels that one padding with
  an inline `!important` and restores it on `pagehide`; measurements use the
  frame's inner edge. `editcheck` reproduces it with a shadow-root stylesheet. Settings > This
  editor > Screen fit shows the numbers, so a screenshot from the phone says
  what the editor saw. `editcheck` covers the geometry in a mock frame; only a
  phone can cover the inset.
- **Settings is the last tab** and the Device screen is called Settings. The
  panel switcher in the top bar only chooses; naming and forgetting a panel are
  in Settings > Panels. With one panel the switcher is a plain name.
- The UI is built to a Claude Design project ("glass"): floating panels,
  Bauhaus colour, **light and dark**. `theme.js` sets `<html data-theme>` --
  following Home Assistant's own `hass.themes.darkMode` off the ingress parent,
  else the OS, unless the theme in the Device screen's This editor section overrides it per
  browser -- and the dark theme is one block of token overrides in
  `styles.css`. **A literal colour in a rule is a dark-mode bug**: use
  `--ink-rgb` (text, hairlines), `--shade-rgb` (blurred shadows, scrims, always
  dark), `--paper-rgb`/`--surface` (surfaces), `--picture` (anything holding a
  picture of the panel, white in both). White on the gradient stays literal.
  `test-harnesses/themecheck.mjs` audits every screen in both themes for white
  boxes and unreadable text. **The canvas is exempt** — `.panel` resets its own
  tokens to black-on-white so the e-ink preview never follows the interface.

## Conventions that bite

- **A `<label>` names one control.** Wrapping a group of buttons in one hands
  every button the whole label as its accessible name. Groups use a `div` with
  `role="group"`. This has been fixed three times.
- React ignores `el.value = x` on a controlled input; type, or use the
  prototype's setter.
- The image manifest published over MQTT must fit the device's **16KB buffer** —
  going over drops the message rather than truncating it.
- **Nothing in the backend may hardcode the panel's pixels.** A screenshot is
  the framebuffer verbatim and the two panels' are 115,200 and 64,800 bytes;
  `reports.py` had one pair of constants and refused the smaller panel's picture
  as a truncated upload. Ask `grids.of(panel_id)`.
- **`image_base_url` is corrected, not trusted.** The firmware wants
  `http://host:port` exactly and refuses anything else; what people type is
  `192.168.178.35`. Seen on a real install, where it cost the images, the boot
  log, and the HTTP manifest — which then fell back to one 15KB MQTT publish.
- Anything written to `DATA_DIR` that a background task also reads must be
  written atomically (temp file + `os.replace`). A truncating write once deleted
  a user's photo album.
- Releasing = bump `dashboard/config.yaml` **and** `dashboard/CHANGELOG.md`,
  rebuild `dist`, commit to `main`. This repo carries no tags and has no CI.
  Keep the version in step with the firmware's when they ship together.
