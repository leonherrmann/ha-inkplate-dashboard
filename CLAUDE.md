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

`python3` on PATH is miniconda 3.8 and **cannot parse this backend** (`str |
None`). That error means the wrong interpreter, not a broken edit.

```sh
/opt/homebrew/bin/python3.13 -m venv /tmp/ink-venv
/tmp/ink-venv/bin/pip install -r dashboard/backend/requirements.txt pillow

cd dashboard/backend
/tmp/ink-venv/bin/python importcheck.py            # every module imports
PYTHONPATH=. /tmp/ink-venv/bin/python ../../../test-harnesses/manifestpostcheck.py
PYTHONPATH=. /tmp/ink-venv/bin/python ../../../test-harnesses/albumcheck.py
PYTHONPATH=. SUPERVISOR_TOKEN=test /tmp/ink-venv/bin/python ../../../test-harnesses/adoptcheck.py
PYTHONPATH=. SUPERVISOR_TOKEN=test /tmp/ink-venv/bin/python ../../../test-harnesses/timercheck.py
PYTHONPATH=. /tmp/ink-venv/bin/python ../../../test-harnesses/imagecheck.py
cd .. && /tmp/ink-venv/bin/python tools/dithercheck.py
```

`imagecheck.py` holds the picture pipeline to an **independent implementation**
rather than to a recorded answer: the obvious pixel-by-pixel loop is written out
inside it, and the fast code has to agree with it on every shape. That is what
makes it safe to make `images.py` faster, which is worth doing -- three quarters
of a conversion turned out to be work nobody needed. `dithercheck.py` is the
other half of the same contract, against the browser.

Pillow is deliberately absent from `requirements.txt` (the Dockerfile installs
it via apk). The harnesses live in the sibling `test-harnesses/` directory and
are not committed anywhere.

**`importcheck.py` before any release** — 2026.9.29 shipped an add-on that could
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

```sh
cd dashboard/frontend && npx serve dist -l 8127     # in one shell
cd ../../../test-harnesses && node sheetcheck.mjs   # 40 checks, mobile sheet
cd ../../../test-harnesses && node pickercheck.mjs
cd ../../../test-harnesses && node devicecheck.mjs   # the Device screen, phone and desktop
```

`/entities`, `/devices` and `/areas` answer with a **bare array**, not an
object — a stub that wraps them crashes the inspector rather than emptying it.
`sheetcheck.mjs` stubs `/status` with `manifest.json` next to it, which is
`./sim/preview --manifest` from the firmware repo.

**Headless WebKit reports `backdrop-filter` as supported and then does not
blur.** A screenshot showing the page legible through a glass surface is that,
not a bug — but it is also why the sheet is 0.9 white rather than `--glass`:
a surface that covers a whole page cannot rely on a blur to hide it.

## Layout of the code

- `dashboard/backend/main.py` — the API. `store.py` holds the draft layout,
  `mqtt.py` the device link, `images.py` the 1-bit conversion, `albums.py` +
  `icloud.py` the photo albums, `registry.py`/`ha_bridge.py` Home Assistant.
- `dashboard/frontend/src/` — `App.jsx` owns the layout state,
  `Inspector.jsx` renders a widget's options from the manifest,
  `WidgetPreview.jsx` draws each widget on the canvas.
- **On a phone the toolbar is shorter than on a desktop.** The four selection
  actions are not on it: they are already on the widget's own sheet, which at
  that width is over the canvas and nearer than the bar. Zoom is a menu rather
  than three pills. `PageBar` chooses with `useNarrow` rather than hiding a
  second copy with CSS -- two copies are two tab stops.
- **On a phone the Device screen is a list of rows, one per setting**, each
  opening on its own; the desktop keeps the four cards side by side. Same shape
  as the sheet's option rows, deliberately -- these are the same idea, and a
  setting is something you set once and read at a glance after that.
- **A big option in the sheet is a row that opens a screen**, not a control
  expanded in the list: a room card has twelve options and nobody is looking at
  eleven of them. `wantsScreen()` in `Inspector.jsx` decides, and the firmware
  says which `text` options are multi-line -- a name and a paragraph are both
  "text" and want different controls.
- **The sheet's peek height is measured, not `auto`.** A transition with `auto`
  at one end does not run, so the sheet snapped open instead of rising; Sheet.jsx
  measures the row and puts the number back as a length.
- **Below 820px the inspector is a bottom sheet** (`Sheet.jsx`, design 1b) at
  three heights, portalled to `document.body`. It marks `<html>` with
  `.sheet-open` and `data-sheet`, and the stylesheet answers with `--sheet-h`:
  the sheet's height and the room the page reserves under it are the same
  number, because that reserve is also what gives the page the scroll range to
  lift the canvas clear of the sheet. `Inspector.jsx` renders the same head and
  fields into either shell.
- The UI is built to a Claude Design project ("glass"): floating panels,
  Bauhaus colour, light only. **The canvas is exempt** — `.panel` resets its own
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
