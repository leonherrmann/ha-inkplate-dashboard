# Changelog

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
