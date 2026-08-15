# Changelog

## 0.8.0

- Pages. Design several, keep them in a library, and put a selection on a rotating
  queue that the device cycles itself. Each page can sit out of the queue or hold
  the screen for longer than the default.
- Three tabs — Design, Queue and Device — so no single screen carries everything.
- The layout version number is gone from the interface; it just says whether the
  device is in sync.

## 0.7.0

- Charging indicator: a bolt on the battery when the voltage is climbing, worked out
  by the add-on and published back so an on-device widget can show it too.
- Battery history sparkline in the Device panel, seven days at 15-minute resolution,
  shaded where the device was not reporting.

## 0.6.0

- Reorganised around what things are for. Night sleep and device health moved out
  of the widget palette into a Device panel opened from the header; view controls
  sit with the canvas they act on.
- Shows when the device was last heard from, and it now announces a planned sleep
  so a quiet night does not look like a fault.
- The canvas no longer overflows on a phone, and the time inputs stay in their box.

## 0.5.0

- Night sleep: set a window and the device deep-sleeps through it to save battery.
  The e-ink keeps showing the dashboard while asleep. Choose whether it sleeps
  right through or wakes periodically to refresh the clock and collect pushes.

## 0.4.0

- Entity selection is a modal with area tabs, a domain filter and search, instead
  of one long list.
- The device is told Home Assistant's timezone on every push, so the clock follows
  daylight saving without being configured twice.

## 0.3.1

- Widget previews now match the real widget size exactly. The weather widget was
  previewed a third too large, and previews no longer bleed outside their footprint.
- The weather preview is black with white content, like the device draws it.

## 0.3.0

- Image, battery and weather widgets appear in the palette, with previews. Image
  widgets show the real picture and size themselves to it.
- Weather forecasts are bridged from Home Assistant by calling
  `weather.get_forecasts`, since the forecast attribute was removed in 2024.4.
- Entity picker offers weather entities for the new widget.

## 0.2.1

- Fix the panel overflowing the screen on mobile, and stop it trapping page
  scrolling. Adds a Fit / 50% / 100% zoom for precise placement on a phone.

## 0.2.0

- Tap a widget to select it. Selection no longer requires dragging first, and widgets
  have stable ids, so deleting one leaves the others alone.
- Works on a phone: long-press to drag, swipe still scrolls, and the panel scales to
  the viewport with the palette and inspector reflowing.
- Positions are pixels with a Coarse / Fine / Free snap toggle, instead of a fixed
  80px grid. Existing layouts are migrated.
- Bauhaus redesign.
- Device stats: battery, voltage, WiFi signal, uptime and free heap.
- Entity picker is searchable and grouped by Home Assistant area.

## 0.1.1

- Icon options are picked from a dropdown of the names the firmware reports it has,
  instead of a free-text box. A name the device could not resolve used to crash it.

## 0.1.0

First version. Grid editor for the Inkplate 5 dashboard:

- Widget palette built from the retained manifest the firmware publishes
- 16×9 grid matching the panel, drag to position, options edited per widget
- Push publishes the layout retained to `<device_id>/config/set` and shows what the
  device reports it applied
- State bridge republishes the Home Assistant entities the layout references to
  `<device_id>/state/...`
