# Changelog

## 2026.9.9

- **Undo and redo.** `⌘Z` and `⇧⌘Z` — or `Ctrl+Z` and `Ctrl+Y` — take back any
  edit to the layout: moving a widget, changing an option, adding or removing a
  page, reordering the queue, and the chips that go when a page's chip row is
  turned off. It is the draft that is undone, so press Push to send the result
  to the panel.
- **Duplicate a widget** with `⌘D`, or the button in the toolbar. The copy keeps
  the original's size and options and lands on the next free cell.
- **Resize on the canvas.** Drag the red corner of a selected widget. A widget
  can only be one of the sizes the panel knows how to draw, so the outline snaps
  between them and names the one it is about to become.
- **Say which widget is drawn on top** where two overlap, with the new Layer
  controls in the inspector. That is the order the panel draws in, so the canvas
  now shows the same answer the device will.
- Buttons in the inspector's Size and Layer rows announce their own names to a
  screen reader again, rather than their neighbours'.
- Needs no firmware update — works with **v2026.9.8**.

## 2026.9.8

- **The room card, finished.** Lights, plugs, whatever is playing, and windows
  and doors — each as an icon with a count beside it, under a black band
  carrying the room's temperature, humidity and, where there is width for it,
  the air quality.
- **An icon fades when nothing in it is on.** A room with every light off shows
  a greyed lamp, so you can read the card at a glance without reading the
  numbers — which is the whole point of the smallest size, where there is no
  room for numbers at all.
- **The bigger sizes say it in words**: "3 on – 1 off", "All closed", or the
  track that is playing and the speaker it is on.
- **Each size is laid out for its own shape** rather than being one picture
  scaled, and the heating sits in the same corner badge the climate card uses,
  so the two cards read as one family.
- Needs firmware **v2026.9.8**.

> There is no firmware v2026.9.7. Its build failed and it was never published,
> so this release supersedes add-on 2026.9.7 as well.

## 2026.9.7

- **The room card is redesigned.** A black band across the top carries the
  room's own conditions — how warm it is, how humid, and on the wider sizes the
  PM2.5 and CO2 — with the room's icon at its right. Below it, one badge per
  thing the room can tell you about.
- **Plugs and switches are counted now**, alongside lights, windows and doors,
  and whatever is playing.
- **The bigger sizes explain themselves in words.** Instead of a bare number,
  the wide card says "3 on – 4 off", "All closed", or the name of the track
  that is playing.
- **All five sizes are laid out for their own shape** rather than being the
  same picture scaled: the small one shows icons only, the tall one gives each
  thing its own line, and the wide one fits two short answers per line.
- What the heating is set to sits in the same corner badge the climate card
  uses, so the two cards read as one family.
- Needs firmware **v2026.9.7**.

## 2026.9.6

- **The climate card is redesigned, and comes in a third size.** The room now
  sits in a badge in the top corner, and what the heating is set to sits in a
  matching one in the bottom corner — a circle cut off by the edge of the card,
  so the frame looks like it swells and turns solid there. A new **Large
  (2x2)** size joins Small and Wide, with the temperature set at 112px.
- **The heating badge says whether it is actually running.** The heater symbol
  is struck through when it is off, rather than being a different symbol you
  have to learn.
- **Every room icon is a badge now.** Only two of the ten were drawn that way,
  so a dashboard mixed solid discs with floating outlines depending on which
  rooms you had picked.
- **Some cards were drawing their reading a size too large.** A fault in how
  the firmware picked a font meant several widgets fell back to the biggest
  face rather than the one their layout asks for — the wide air quality card
  was setting its value half again too big. Fixed, so those cards are a little
  smaller and better spaced.
- Readings are now measured against the badges beside them, so a three-digit or
  below-zero temperature is set smaller instead of colliding with one.
- Needs firmware **v2026.9.6**, which is what draws all of this.

## 2026.9.5

- **Five new domain-specific cards: Light, Door/Window, Air Quality, Media and
  Room.** Each offers the same five sizes as every other widget (Small, Wide,
  Large, Tall, Wide large). All five are focused on icons and short text, in
  the spirit of the climate widget: a light shows a filled or outline bulb and
  a brightness percentage, a door/window card inverts to black while open, air
  quality shows the first bound pollutant on a five-step severity scale, and
  media shows a play/pause glyph in front of the track title.
- **The Room widget summarises a room rather than listing it.** Pick a room and
  it fills itself in: how warm it is, how many lights are on, whether anything
  is open, whether anything is playing — one glyph and a count per question,
  not a row per entity. Auto-populated from Home Assistant's areas, then still
  editable by hand, the same as the Device widget's entity list.
- Needs firmware **v2026.9.5**, which draws all five cards.

## 2026.9.4

- **The chip row can be turned off, and it is now set per page.** Top, bottom or
  off, chosen for the page you are editing rather than for the whole dashboard —
  so a full-screen clock page can drop the row while a dashboard page keeps it.
- **A page without a chip row gets taller cards.** The row and its gap are 102
  pixels, and that page's three card rows take them: cards are 200 tall instead
  of 166, filling the panel. Every widget simply gets taller; none of them is
  redrawn. Turning the setting on or off moves the page's widgets to the rows
  they were on, keeping any offset you had nudged them by.
- **Turning the row off deletes that page's chips**, after asking. There is no
  undo yet, so it cannot be taken back — the confirm says how many will go. The
  palette will not add a chip to a page that has no row.
- The canvas draws real renders of the taller cards, so what you place is what
  the panel will draw.
- Needs firmware **v2026.9.4**, which is what reads the setting and lays a page
  out at the taller height. Against an older firmware a page with the row off
  would be drawn with 166px rows and everything below the first row misplaced.

## 2026.9.3

- **Dragging widgets works on a phone.** Two faults that compounded each other:
  holding a widget made Safari offer to save the image instead of picking the
  widget up, because a widget preview is an image and the drag gesture is a
  press and hold; and the drag itself started only sometimes, because the
  browser could begin scrolling during the moment before the drag was
  recognised. A touch that begins on a widget now belongs to the drag, while
  swiping the background still scrolls the page.
- Add-on only. No firmware change: still needs **v2026.9.2**.

## 2026.9.2

Numbered to match the firmware it needs. There is no add-on 2026.9.1 — that was
a firmware-only fix.

- **The panel can show its own diagnostics.** A new button on the Device tab puts
  the device's network, broker and firmware details on the screen itself for a
  minute. Shown on the panel rather than here on purpose: everything the device
  reports reaches this add-on over MQTT, so when MQTT is what is broken this page
  can only say "offline" — which is exactly when you most want to know what
  broker it thinks it should be dialling.
- Needs firmware **v2026.9.2**, which fixes a fault that stopped pushed layouts
  arriving at all on dashboards with many entities.

## 2026.9.0

Versions are CalVer from here — `YYYY.M.PATCH`, the same scheme Home Assistant
itself uses. This follows 0.30.0; nothing is skipped.

- **Two new clock sizes: half screen and full screen.** Half screen sets the
  hours over the minutes at 250px with the date beside them; full screen puts
  the whole time on one line at 324px. They appear in the size picker once the
  panel is running firmware v2026.9.0.
- **The small clock sets the hours and minutes at the same size.** It used to
  set big hours beside small minutes, which is harder to read as a time, not
  easier. **Any 2x1 clock already on your dashboard will change appearance.**
- Needs firmware **v2026.9.0**.

## 0.30.0

- **You can set how often the screen clears itself**, on the Device tab under
  Screen refresh. e-ink repaints quickly but each quick repaint leaves a faint
  ghost; only the slow black flash clears them. The device now measures how much
  of the screen has actually ghosted and flashes once it passes the share you
  choose, so a dashboard where little moves goes roughly two hours between
  flashes instead of the twenty-five minutes it used to.
- Four levels, from **Cleanest** to **Rarely**, defaulting to **Balanced**. The
  estimates are hedged on purpose: the same setting is about an hour on a page
  with a large clock and over two on a typical dashboard.
- A percentage set outside the editor shows as **Custom** rather than being
  snapped to the nearest level.
- Needs firmware **v0.1.29**.

## 0.29.0

- **The small clock's date is bigger**, and shows the month above the day again
  ("AUG" over "16"). It had been sized as a caption on the time, which left it
  hard to read next to the hour.
- Needs firmware **v0.1.27**.

## 0.28.0

- **Chips can sit in a group at each end of the row again.** 0.27.0 spaced them
  evenly but pulled them all to the left; now the side you drag a chip to is
  the side it aligns to, and each group is evenly spaced within itself.
- **The small clock shows the day above the month** ("16" over "AUG").
- Needs firmware **v0.1.26**.

## 0.27.0

- **Chips in the status row are spaced evenly.** The editor can only guess how
  wide a chip will be — what it actually takes depends on the reading it shows
  — so chips that looked evenly spaced here could end up with very uneven gaps
  on the panel. The panel now spaces them itself, keeping the order you gave
  them. Positions on the canvas are still approximate for chips.
- **The small clock shows a shorter month** ("AUG 16" rather than "AUGUST 16"),
  which stops the month dwarfing the day, and the whole widget is properly
  centred.
- Needs firmware **v0.1.25**.

## 0.26.0

- **The clock is drawn in the dashboard's own typeface now.** It used to carry
  its own hand-made digits; it uses Nunito like every other widget, so the two
  clock sizes and the cards around them finally match. It looks near enough
  identical — the change is that the digits are evenly spaced, so the time no
  longer shifts a little as the numbers change.
- Needs firmware **v0.1.23**.

## 0.25.0

- **Any entity as a chip in the status row.** Alongside the clock, battery and
  connection chips you can now put a reading from Home Assistant — "19.4°C"
  beside a thermometer, "Open" beside a door. It picks its own icon from the
  kind of entity it is, and takes only as much width as its reading needs.
- The chip shows the reading alone by default. Type a **Name** if you want a
  word in front of it, which is worth doing when two chips would otherwise
  draw the same icon.
- Needs firmware **v0.1.22**.

## 0.24.0

- **A bigger clock.** The clock now comes in two sizes, and the new **Big**
  one shows the minutes at the same size as the hours with the date spelled
  out underneath — meant to be read from across the room rather than from
  your desk. The existing Wide clock is unchanged, and clocks already on a
  page stay exactly as they are.
- Needs firmware **v0.1.21** for the new size to appear.

## 0.23.0

- **Choose which of a device's entities the card shows, and in what order.**
  Picking a device still fills the list in for you, but that ranking is only a
  good guess on average — whether the humidity or the CO2 belongs on the card
  depends on what the panel is for. The inspector now lists every entity the
  device has, with the chosen ones at the top in their own order and the rest
  below, and arrows to move them.
- **Order decides what survives a smaller card.** The card draws its main
  reading from the first entity and fills the rest in order, so anything past
  what the chosen size can draw is marked *not drawn at this size* rather than
  quietly disappearing.
- **Devices no longer offer entities that cannot say anything.** Every Zigbee
  and Matter device carries an Identify button, and a few carry Restart or Ping;
  a button's state is the moment it was last pressed, so a row for one would
  show a time that never changes. Fifteen kinds of entity are left out on the
  same grounds.
- **The device card has been redesigned**, and needs firmware **v0.1.20** to
  appear that way on the panel — the editor's pictures of it are updated either
  way. It now gives the main reading a white box and sets everything else as
  plain type around it, instead of boxing every reading equally.

## 0.22.0

- **Widgets now show what an entity actually means, not "on" or "off".** A light
  shows its brightness and its colour temperature, a door shows Open or Closed, a
  blind shows how far it is open, a thermostat shows the room temperature and what
  it is heating to. Around twenty kinds of entity are handled, and binary sensors
  use Home Assistant's own wording — a leak sensor says Wet, a motion sensor says
  Detected.
- **The icon is chosen for you.** A light that is off draws an outline bulb and a
  lit one draws a filled bulb; an open door and a shut door are different glyphs.
  You can still override it per widget, but you no longer have to pick one.
- **The wide and large sizes now say more, not just say it bigger.** The wide size
  puts a second fact beside the reading, and the large size puts it on a line of
  its own; the small size still shows one number, as big as it will go. Choosing
  the size is how you ask for more detail.
- **A new Device widget.** Home Assistant groups entities under the physical
  device they belong to, and this puts one on a card: a door sensor showing Open,
  its battery and its temperature together, instead of three separate widgets.
  Pick a device and the editor works out which of its entities are worth showing
  and in what order. Three sizes, holding four to eight rows.
- The device's own name is stripped from each row, so "Front Door Battery" reads
  as "Battery" under a card headed "Front Door" — the same thing Home Assistant's
  device page does.
- Editor previews for entity widgets now match the kind of entity you picked, so
  a light and a door no longer look the same on the canvas.

Needs firmware **v0.1.19**, which is where both widgets live. On an older panel
the editor will not offer the Device widget and entity cards will keep their old
appearance, because the widget list comes from the device.

## 0.21.0

- **A new Entity widget**, for everything the Climate and Weather cards are not:
  a sensor, a plug, a light, a door. Pick an entity and an icon and it shows its
  reading. It comes in **three sizes** — small, wide and large — which differ in
  how big everything is drawn rather than in what is drawn, so a wall of them
  reads the same way at any size.
- **The name and the unit come from Home Assistant.** You do not have to type
  either: the entity's own name and unit arrive with its state. Both can still be
  overridden per widget, which is worth doing on the small size, because Home
  Assistant names run long and "Hallway Temperature Sensor" does not fit across a
  small card.
- A reading too wide for its card is **drawn smaller rather than cut off**. A
  truncated number is not a partial reading, it is a different and entirely
  believable one. Names are still shortened to fit — a label can lose its tail, a
  reading cannot. An entity Home Assistant cannot reach shows a dash.
- The **icon list no longer shows every icon twice.** Some icons exist at two
  sizes so a widget can pick the right one for the card it is on; the editor was
  offering both as though they were different icons.

Needs firmware **v0.1.18**, which is where the widget itself lives. On an older
panel the editor simply will not offer it, because the widget list comes from the
device.

## 0.20.0

- **The panel appears in Home Assistant as a device**, with ten entities, and
  you do not have to write a line of YAML for it. Everything it reports was
  already travelling over MQTT but stopped at this add-on, so the battery could
  only ever be looked at here. Now there is a real sensor to put on a dashboard,
  graph for as long as Home Assistant keeps history, and write automations
  against — "tell me when the panel drops below 20%", or "show the weather page
  at seven".

  You get: **connectivity**, **battery**, **battery voltage**, **charging**,
  **WiFi signal**, **uptime**, a **Refresh** and a **Next page** button, a
  **Page** select listing your pages, and a **Firmware** update entity — so the
  panel turns up in Home Assistant's own updates list alongside everything else.

- The Page select follows your layout: add, remove or rename a page and its
  options change with it.
- **`discovery_prefix`** is a new option, for a broker that keeps Home
  Assistant's discovery somewhere other than `homeassistant`. Clear it to
  create no entities at all. Note that clearing it stops new announcements but
  does not remove entities already created — those are retained messages held
  by your broker, not by this add-on.

Pairs with firmware **v0.1.16**, which stops a failed lookup of
`homeassistant.local` from taking the panel off MQTT — it now remembers the
address that last worked. This add-on does not require it, and v0.1.16 does not
require this add-on, but they were released together.

## 0.19.0

- **Widgets are drawn from real pictures of the panel**, not from an imitation
  of it. The editor used to draw each widget a second time in CSS by hand, and
  the two copies drifted apart — 0.17.1 shipped "the battery preview matches the
  firmware again" as a bug fix, which is the sort of thing only somebody's eyes
  ever catch. These images are rendered from the firmware's own sources, so they
  cannot disagree with the panel.
- **The Add widget list shows each widget** instead of only naming it. Same
  pictures, shrunk. The list had to be relaid out to fit them: the name sits
  above the size now rather than beside it, because side by side in that narrow
  column "Update available" and its size pushed each other out of the button.
- **Climate has a picture per room**, so the widget on the canvas shows the room
  you actually chose rather than a stand-in for it.
- **Text and Image are deliberately unchanged.** What they show is yours — your
  words, your photograph — so they are still drawn live rather than replaced by
  a picture of somebody else's content.

Needs no firmware update: this is all on the add-on side and **v0.1.15 is still
the current firmware**. A widget offered by a firmware newer than this add-on
knows about still appears in the list, just without a picture.

## 0.18.0

- **Photos get rounded corners**, to the same radius as a widget, so a picture
  sits among them rather than on top of them. On by default, with a toggle to
  keep them square. Photos only — "pixel accurate" exists so that what you drew
  is what gets drawn, and rounding it would break that promise. The corners
  become white rather than transparent, because the panel has no alpha.
- **Wifi and MQTT are separate widgets.** As one it changed width depending on
  its state — narrow when healthy, wider when it grew the broker-down cloud —
  which meant the editor could never reserve the right amount of room for it.
  They are also two different faults with two different fixes, the router or
  Home Assistant, so they are worth saying separately.
- **A new "Update available" widget**, which appears on the panel only when
  newer firmware is on offer and takes no room at all otherwise. The editor
  always draws it, so you can place it before it has anything to say.
- Chips carry the same offset shadow as the other widgets. The clock and the
  battery have no outline at all — both are already a strong rectangle, and a
  border around one is a box drawn on a box.
- The battery shows its percentage before the cell, with the number in a fixed
  slot so the cell does not shuffle sideways as the reading changes.

Wants firmware **v0.1.15** for the new widgets and the changed battery. On an
older panel the editor simply will not offer MQTT or Update available, because
the widget list comes from the device.

Note for existing layouts: a `wifi` widget you already placed now shows only
wifi. Nothing is lost, but add an **MQTT** widget beside it to keep an eye on
the broker.

## 0.17.1

- **Chips can no longer land on top of each other.** Placement checked the panel
  edges and nothing else, so dropping one chip onto another put both at the same
  position — and because the clamp floors at the left gap, dragging anywhere left
  of a neighbour stacked them both against the left edge. The row is still free
  to the pixel, but a chip now keeps at least the grid's gap from its neighbours
  and from the panel edges, sliding clear of whatever is in the way. Adding a
  chip follows the same rule instead of dropping it on what is already there.
- The battery preview matches the firmware again: no outline, and a bigger cell.

Wants firmware **v0.1.14**, which takes the outline off the clock and the
battery on the panel itself.

## 0.17.0

- The panel has a **chip row**: one row of small widgets — wifi, battery, and
  the sensor chips to come — along the top or the bottom, chosen from the
  toolbar. Card rows are 166px tall now instead of 200 to make room for it.
- Chips are **not restricted in width**. They take exactly the space their
  content needs and sit freely along the row, because a status row is labels of
  different lengths and snapping them to a column would either truncate the long
  ones or pad the short ones out to nothing.
- Moving the chip row between top and bottom **moves every widget with it**, so
  a layout stays aligned instead of sitting a row's height out.
- The **grid preview shows the real cells**, as rectangles with the 30px gap the
  device actually leaves around each one. It used to draw rules on the cell
  boundaries, so the gap was invisible and widgets looked like they should butt
  up against each other.
- The clock is a 2x1 widget rather than a fixed size of its own.
- **Existing layouts are migrated automatically** when the add-on starts. Widget
  positions are absolute pixels, so without this everything below the first row
  would sit 34px too low per row; battery and wifi move into the chip row.
- Needs a firmware build with the chip row to draw any of this. Against an older
  panel the editor falls back to the grid it knows and keeps working, but the
  device will go on rendering the 200px rows until it is updated.

## 0.16.0

- The sync indicator tells the truth. It had two states and could only compare
  version numbers, which editing does not change — only a push does — so a
  layout full of unsent edits still read "In sync". The add-on now records a
  fingerprint of what it last sent, and the indicator distinguishes:
  **Changes not pushed** (saved here, not sent), **Awaiting device** (sent, and
  the panel has not confirmed it — the normal state while it is in its night
  sleep), **Device refused it** (it arrived and the firmware could not build it,
  with the reason on hover), **In sync**, and **Unknown** when the device has
  never said what it is showing. Push is highlighted only for the one state
  pressing it resolves.
- A push that could not reach the MQTT broker says so instead of reporting
  "Sent to the device", and is no longer recorded as having been sent.
- Upgrading does not need a push to settle the new indicator: with no record of
  its own yet, the add-on takes the version the device reports as evidence of
  what went out.

## 0.15.3

- A widget dragged into a corner could end up off the panel entirely. Grid mode
  snapped the edge limit to the *nearest* cell, which is often the one past it,
  so the last legal position could be beyond the panel. The wifi widget landed
  at 1280,720 — completely outside — and the battery fell off the bottom. The
  limit now always rounds down to the last cell that fits.
- Widgets that are already off the panel are moved back to the top left when the
  editor loads. The panel clips anything outside it, so a stranded widget could
  not be selected, dragged or deleted, and there was no way to get it back.
  Widgets that merely overhang an edge are left alone — they are still
  draggable, so that is the user's business.

## 0.15.2

- The entity picker closes in Safari. 0.15.1 only fixed it in Chrome. The
  inspector wraps each option in a `<label>`, and Safari treats a click anywhere
  inside a label as a label activation, forwarding a synthetic click to the
  first labelable descendant inside it — which is the button that opens the
  picker. Choosing an entity closed the modal and instantly reopened it, so it
  looked as though nothing happened, while the entity had in fact been set. The
  modal is now rendered in a portal on `document.body`, outside the label
  entirely.

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
