# Inkplate Dashboard

Edit the layout of an Inkplate 5 V2 e-ink dashboard and push it to the device over MQTT.
No reflash and no device restart — the firmware rebuilds its screen in place.

## Setup

1. Install the add-on and make sure the Mosquitto broker add-on is running.
2. Flash the [firmware](https://github.com/leonherrmann/Inkplate5v2_Interactive_Dashboard)
   and point it at the same broker.
3. Open the add-on. When the device boots it publishes a retained widget manifest, which
   is what fills the palette on the left. If the palette is empty, the device has not been
   heard from yet.

## Options

| Option | Meaning |
|---|---|
| `device_id` | MQTT topic root, must match the firmware's `TOPIC_ROOT`. Default `inkplate5v2`. |
| `log_level` | `debug` is useful when the device is not showing up. |
| `mqtt_host`/`mqtt_port`/`mqtt_user`/`mqtt_password` | Only needed for a broker outside Home Assistant. Left empty, the add-on uses the broker HA provides. |

## How it works

- **Editing** is local. Every change is saved to `/data/layout.json` as a draft.
- **Push** publishes the draft retained to `<device_id>/config/set` and bumps its version.
  The device applies it and echoes what it accepted on `<device_id>/config/current`, which
  the header shows next to the draft version. If those two disagree, the device rejected
  the layout — check its serial log.
- **The state bridge** watches Home Assistant for exactly the entities the pushed layout
  names and republishes them to `<device_id>/state/<entity_id>`, plus each scalar attribute
  under `<device_id>/state/<entity_id>/<attribute>`. Widgets that need an attribute rather
  than a state, like the climate widget's target temperature, read the latter.
- **The theme** follows your system by default. The chip in the header cycles Auto, Light
  and Dark, and the choice is kept in the browser, so it is per-browser rather than per
  add-on. The canvas stays black on white either way: it shows what the panel will draw,
  and the panel has no dark mode.

Everything is published retained, so a device that reboots or receives a new layout renders
real values immediately rather than waiting for the next change.

## What the panel reports back

The **Device** tab can ask the panel for two things it cannot work out on its own:

- **A screenshot.** The panel sends the framebuffer it is showing and the add-on
  stores it as a PNG. It is also a **Screen** entity in Home Assistant, so a captured
  picture can go on a dashboard there. Taken only when asked — an e-ink dashboard
  changes slowly, so a picture on a timer would mostly be the same picture again.
- **Its log.** The panel keeps its last few kilobytes of output in memory and uploads
  them on request, and **once on its own after every boot**. The boot copy is the one
  worth having: a slow WiFi association or a broker refusing credentials happens
  during startup, hours from anyone holding a serial cable.

Both are uploaded over plain HTTP to the same port the device fetches images from,
because the editor is behind Home Assistant's authenticated ingress and the panel
cannot log in to it. Those two upload routes are **unauthenticated**: anything on your
network can post a screenshot or a page of log and the add-on will believe it.

## Editing the canvas

- **Drag** a widget to move it; **Snap** decides whether it lands on a cell, on 20px, or
  anywhere. Drag the **red corner** of a selected widget to change its size — a widget can
  only be one of the sizes the firmware offers, so the outline snaps between them and names
  the one it would become.
- **Layer** in the inspector is which of two overlapping widgets the panel draws on top. It
  is the layout's own order, so the canvas shows the same answer the device will.
- **Undo** (`⌘Z` / `Ctrl+Z`) and **redo** (`⇧⌘Z`) cover every edit to the layout, including
  page settings, the queue, and the chips deleted by turning a page's chip row off. It is
  the draft that is undone, not what the device is showing: press Push to send the result.
- **Duplicate** (`⌘D`) copies the selected widget, its size and its options onto the next
  free cell.

## Development on a laptop

The add-on runs outside Home Assistant, minus the state bridge (no `SUPERVISOR_TOKEN`, so
entity values will not update — editing and pushing still work):

```bash
python3.11 -m venv .venv && .venv/bin/pip install -r dashboard/backend/requirements.txt
cd dashboard/backend
MQTT_HOST=homeassistant.local MQTT_USER=inkplate MQTT_PASSWORD=... DATA_DIR=./data \
  ../../.venv/bin/python -m uvicorn main:app --port 8099 --reload
```

In a second terminal, the editor with hot reload (it proxies `/api` to port 8099):

```bash
cd dashboard/frontend && npm install && npm run dev
```

> **After changing the frontend, rebuild and commit the output.** The add-on image is
> Python-only and ships `dashboard/frontend/dist` straight from the repository, so an
> unbuilt change will not reach Home Assistant:
>
> ```bash
> cd dashboard/frontend && npm run build && git add dist
> ```

To point it at a real Home Assistant for the bridge and entity pickers, also set
`SUPERVISOR_TOKEN` to a long-lived access token and
`HA_REST_URL=http://homeassistant.local:8123/api`,
`HA_WS_URL=ws://homeassistant.local:8123/api/websocket`.

## Widgets

| Widget | Needs Home Assistant? |
|---|---|
| Clock | No — the device syncs its own time over NTP |
| Battery | No — reads the on-board battery directly |
| Image | No — draws one picture, uploaded here or flashed into the firmware |
| Photo album | No — rotates through an iCloud shared album, fetched by this add-on |
| Climate | Yes — temperature, humidity and radiator entities |
| Weather | Yes — a `weather.` entity, forecast fetched by this add-on |

### Adding one

Widgets are defined in the firmware, not here. Register the type in the firmware's
`WidgetRegistry` and it appears in the palette automatically on the next boot. Only the
preview is this repository's concern: add a component to
`dashboard/frontend/src/WidgetPreview.jsx`. Until you do, the widget still works and is
placeable — it just renders as a labelled placeholder in the editor.

### Images

Upload a picture in the **Images** tab. Frame it by dragging, set brightness, contrast
and the dither, and the preview shows the actual 1-bit result — the panel has no grey, so
what you see there is what it will draw. The add-on converts it to the exact pixel size
the widget occupies and the panel downloads it to its SD card; nothing is decoded on the
device.

Pictures can also be compiled into the firmware from `images/photos/` in the firmware
repository: drop a PNG there, run `python3 iconConvert.py`, and reflash. They appear in
the picker as `photos_<name>`. An upload of the same name wins over a built-in one.

### Photo albums

A **photo album** widget cycles through an iCloud shared album — set the rotation
interval, whether to crop to fill or fit the whole picture in, and whether to draw a
border.

Add the album in the **Images** tab, not on the widget: an album is a source, and any
number of widgets can show it. In Photos, share an album, turn on **Public Website**, and
paste the link. Nothing is signed in to — the link is all iCloud needs, and the add-on
only ever reads. Apple publishes no API for this, so it speaks the same undocumented
endpoint Apple's own web viewer uses, and could break if they change it.

Pictures are rendered only for the widgets that actually show them. Each combination of
album, widget size, crop and border is a separate set of images on the SD card, so two
widgets showing one album at different sizes cost twice the space. Albums are re-read
every six hours, and on demand with **Refresh**.

Keep albums small. Every picture is dithered here in Python, which takes a few seconds
each, and every picture costs an entry in the manifest sent to the panel — which has a
16 KB limit on it. The default is to keep the newest 25.
