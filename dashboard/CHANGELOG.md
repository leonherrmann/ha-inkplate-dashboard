# Changelog

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
