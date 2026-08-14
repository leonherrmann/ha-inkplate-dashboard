# Inkplate Dashboard add-on

A Home Assistant add-on that edits the layout of an Inkplate 5 V2 e-ink dashboard and
pushes it to the device over MQTT — no reflash, no restart.

The device firmware lives in a separate repository
([Inkplate5v2_Interactive_Dashboard](https://github.com/leonherrmann/Inkplate5v2_Interactive_Dashboard))
and renders everything itself. This add-on owns three things:

1. **The editor** — a grid of the panel's 16×9 cells, a palette of the widgets the
   firmware reports it can build, and a preview of the result.
2. **The push** — the layout is published retained to `inkplate5v2/config/set`; the
   device rebuilds in place and echoes what it applied on `inkplate5v2/config/current`.
3. **The state bridge** — for exactly the entities the pushed layout references, Home
   Assistant state changes are republished to `inkplate5v2/state/<entity_id>`, so the
   device never talks to the HA API itself.

The widget palette is not hardcoded here. The firmware publishes a retained capability
manifest on `inkplate5v2/manifest` describing every widget type, its grid footprint and
its options; the editor builds itself from that, so the two repositories cannot drift.

## Add-ons

### [Inkplate Dashboard](./dashboard)

## Installation

Add this repository to Home Assistant → Settings → Add-ons → Add-on Store → ⋮ → Repositories:

```
https://github.com/leonherrmann/ha-inkplate-dashboard
```
