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

**The firmware owns the widget list.** It publishes a manifest of every type,
size and option; this repo renders an editor for it. Never hardcode a widget,
size, option or category list here.

## Running the checks

`python3` on PATH is miniconda 3.8 and **cannot parse this backend** (`str |
None`). That error means the wrong interpreter, not a broken edit.

```sh
/opt/homebrew/bin/python3.13 -m venv /tmp/ink-venv
/tmp/ink-venv/bin/pip install -r dashboard/backend/requirements.txt pillow

cd dashboard/backend
/tmp/ink-venv/bin/python importcheck.py            # every module imports
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

## Layout of the code

- `dashboard/backend/main.py` — the API. `store.py` holds the draft layout,
  `mqtt.py` the device link, `images.py` the 1-bit conversion, `albums.py` +
  `icloud.py` the photo albums, `registry.py`/`ha_bridge.py` Home Assistant.
- `dashboard/frontend/src/` — `App.jsx` owns the layout state,
  `Inspector.jsx` renders a widget's options from the manifest,
  `WidgetPreview.jsx` draws each widget on the canvas.
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
