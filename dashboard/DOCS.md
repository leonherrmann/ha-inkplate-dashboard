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

Everything is published retained, so a device that reboots or receives a new layout renders
real values immediately rather than waiting for the next change.

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

## Adding a widget

Widgets are defined in the firmware, not here. Register the type in the firmware's
`WidgetRegistry` and it appears in the palette automatically on the next boot. Only the
preview is this repository's concern: add a component to
`dashboard/frontend/src/WidgetPreview.jsx`. Until you do, the widget still works and is
placeable — it just renders as a labelled placeholder in the editor.
