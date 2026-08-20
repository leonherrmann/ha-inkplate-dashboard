# Changelog

## 0.15.1

- Picking an entity closes the picker. It had been leaving the modal open after
  a choice was made, so the only way out was Escape and it looked as though the
  selection had not registered. The modal now closes before the change is
  applied, so nothing downstream can leave it stuck open again.
- Fixed the widget edit path underneath it. Every option change did its work
  inside a React state updater that also saved to the backend and set state
  again from within itself. Updaters have to be pure; breaking that makes edits
  land or not land depending on timing.

## 0.15.0

- Dark mode for the editor. It follows the system by default, which is what Home
  Assistant's own automatic theme does, so the add-on no longer sits as a bright
  panel inside a dark HA. The chip in the header cycles Auto, Light and Dark, and
  the choice is remembered in the browser.
- The canvas keeps drawing black on white in both themes. It is a picture of a
  screen that cannot invert, so a dark preview would show a layout the device
  will never draw.

## 0.14.0

- Upload a photo at any size, not just the grid presets. Pick Custom and give a
  width and height.

## 0.13.3

- Say in the log which options were actually picked up, so "I set it and nothing
  happened" can be answered by looking rather than guessing.
- Read the optional settings with `has_value`. Read straight through, bashio
  hands back the string "null" for an option never given a value, which would
  have been taken for a real setting.

## 0.13.2

- Watch releases in a private repo. Set `github_token` to a fine-grained token
  with read access to the firmware repo's contents; without one GitHub answers
  404 and the add-on cannot tell "no releases" from "not allowed to look".
- Serve the held firmware reliably. The device-facing server runs as its own
  process and was trusting a copy of the state it read at startup, so a release
  downloaded while it was running looked absent.

## 0.13.1

- Drop the four bundled preview photos. They stood in for images compiled into
  the firmware, which have been removed to reclaim 359KB of its flash; photos now
  live on the device's SD card and preview from the converted upload instead.

## 0.13.0

- Over-the-air firmware updates. Set `firmware_repo` to `owner/repo` and the
  add-on watches its releases, holds the binary and offers it to the panel from
  the Device tab. The panel checks the hash before installing, and the
  bootloader restores the previous build if the new one cannot boot.
- The add-on fetches from GitHub on the panel's behalf: releases are HTTPS and
  the firmware has no TLS stack, deliberately.
- Needs firmware with the update support, on the `min_spiffs` partition scheme.

## 0.12.0

- Support for the firmware's new text widget: a multi-line text box, and pickers
  for font and alignment driven by what the firmware says it accepts.
- Text sizes itself on the canvas when set to fit its content, and wraps in the
  preview the way the panel wraps it when confined to a box.

## 0.11.0

- Each image says whether the panel has it: **on device** once it is on the SD
  card, **not yet** while it is still only here. The device reports on its own
  timer, so a new upload flips over within a minute.
- Image widgets on the canvas show the actual picture, dithered as the panel will
  draw it, at the right size instead of a fixed placeholder box.
- Deleting an image now deletes it from the device too, rather than leaving it on
  the card forever. Needs the matching firmware.

## 0.10.3

- Stop claiming the page has no image on it when the device in fact failed to
  read one back off its card.

## 0.10.2

- The Device tab now reports on images: whether the panel has an SD card it can
  write to, how many images it has downloaded, and how many are loaded for the
  page on screen. Needs the matching firmware; older devices show nothing there.

## 0.10.1

- Work out the address to give the device by itself. 0.10.0 asked the Supervisor
  for the host's address without declaring `hassio_api`, so the call was refused
  and `image_base_url` always had to be set by hand.
- Say which address the device is using, rather than only complaining when there
  is not one.

## 0.10.0

- Upload images. A new Images tab converts a picture to the 1-bit form the panel
  draws and serves it to the device, which caches it on its SD card.
- Two kinds, because they want opposite treatment. **Pixel accurate** keeps the
  image at its own size and only thresholds it, for art drawn to match the UI.
  **Photo** crops to fill a grid size you choose and dithers it.
- The image widget's picker now lists uploaded images alongside the icons built
  into the firmware, with a preview of exactly what the panel will show.
- Images are served on port **8098**, mapped straight to the host: the editor is
  behind Home Assistant's authenticated ingress and the Inkplate cannot log in.
  Set `image_base_url` to `http://<your-ha-ip>:8098` if the address the add-on
  works out for itself is wrong.

## 0.9.0

- Snapping to the widget grid the firmware actually uses, so a dragged widget lands
  exactly where it will be drawn. The canvas shows the real cells while in Grid mode.
- Widgets that come in several sizes get a size picker; changing size re-places the
  widget so it stays on the grid and on the panel.

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
