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
cd .. && /tmp/ink-venv/bin/python tools/dithercheck.py
```

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
- Anything written to `DATA_DIR` that a background task also reads must be
  written atomically (temp file + `os.replace`). A truncating write once deleted
  a user's photo album.
- Releasing = bump `dashboard/config.yaml` **and** `dashboard/CHANGELOG.md`,
  rebuild `dist`, commit to `main`. This repo carries no tags and has no CI.
  Keep the version in step with the firmware's when they ship together.
