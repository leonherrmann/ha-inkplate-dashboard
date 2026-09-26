# Changelog

## 2026.9.79

Add-on only. Works with firmware **v2026.9.77**; nothing to flash.

- **The panel list opens where you clicked.** Choosing a panel in the top
  left now drops a short list right under the name, instead of a window in
  the middle of the screen. Rename and Forget are still on each row.

## 2026.9.78

Add-on only. Works with firmware **v2026.9.77**; nothing to flash.

A cleanup of the whole editor: fewer controls in view, and explanations
moved out of the way.

- **One bar over every screen.** The panel's name (tap it to switch or
  rename), whether it is online, its battery, and **Push** -- which says how
  many changes are waiting, or shows the sync state when there are none.
  The device card, the panel name above each screen and the sync card on
  the Device screen are gone; they said the same things three times.
- **A one-row toolbar.** Add widget, Upright/Sideways, **View** (snap, zoom
  and the page's chip row), undo and redo. Bring to front, send to back,
  duplicate and delete now float beside the widget you have selected.
- **Editing a widget on a phone is a screen of its own.** Tap a widget and
  the canvas stays pinned small at the top while its options scroll with the
  page -- no more pull-up sheet with options cut off in a small box. **Done**
  goes back; duplicate and delete are behind **⋯**. The editor itself now
  fits on one screen, with the pages as tabs above the canvas.
- **Settings are sections**: Display, Power, Timers, Panel actions,
  Diagnostics and This editor -- a list beside the open one on a computer,
  rows that open a screen on a phone. Every setting looks the same way, and
  screen refresh is two simple choices.
- **Less text.** Each setting keeps one short line; the longer explanation
  is behind the **ⓘ** next to it.
- On a computer, the columns of every screen now start level.
- **The tab bar sits lower in the Home Assistant iOS app.** The app reserves
  room for the home indicator itself, and the editor was adding it again.
- A page's chip row can be set on the Pages screen. The "default" badge on
  every page is gone.
- The widget picker shows sizes in cells (2×1, 2×2) instead of pixels.
- A widget's name is a one-line field, and the update limit is under
  **Advanced**.
- The canvas no longer shows the grid's tint through the clock.

## 2026.9.75

Add-on only. Works with firmware **v2026.9.74**; nothing to flash.

- **Dark mode.** The editor follows Home Assistant: dark when Home
  Assistant is dark, light when it is light, and it switches when you
  change it there. Opened outside Home Assistant it follows the device.
  A new **Appearance** card under Device sets it to Light or Dark instead,
  for this browser only. The canvas and every picture of the panel stay
  black on white, because that is what the panel draws.

- **A chosen page that is not in the rotation is readable again.** Its tab
  showed white text on a white background in the page list.

- The layer count in the widget options and the counts in the widget
  picker's categories are a little darker, to be readable.

## 2026.9.71

Pairs with firmware **v2026.9.71**. Update the add-on first, then the panels.

- **A battery percentage that means charge left.** It used to be a straight
  line from 3.0 V to 4.0 V, which showed 100% with two-thirds of the
  runtime still to go and 50% with an hour and a half left. The panel now
  reads it off a curve measured from its own full discharges, and holds it
  steady: on battery it only goes down, on the charger only up. **Every
  battery reading will drop** -- 3.90 V was 90% and is now 50% -- because
  the old number was wrong, not because the battery changed.

- **A low-battery warning.** New Low battery card under Device: warn below
  5-30% (15% by default, or Off). Below it, the battery chip shows an
  exclamation mark. Turn on **Full-screen warning** and the panel shows a
  charging reminder instead of the dashboard; on the V2 a button press
  brings the dashboard back until another 5% is used. Both stop the moment
  the panel is charging.

## 2026.9.70

Pairs with firmware **v2026.9.70**. Update the add-on first, then the panels.

- **The battery chip shows a bolt while the panel is charging**, and the
  panel works that out itself -- no add-on needed. It watches for the step
  the voltage makes when the cable goes in or out, and for the 4.2 V a full
  cell only reaches on the charger, so a full panel left on its cable still
  reads as plugged in.

- **Home Assistant's Charging sensor now takes the panel's answer.** It used
  to be guessed here from a quarter-hourly voltage trend, which called a
  panel on its cable "not charging" as soon as the voltage levelled off.
  Older firmware still gets the guess.

## 2026.9.69

Pairs with firmware **v2026.9.69**. Update the add-on first, then the panels.

- **Full screen for a photo album, on every panel either way up.** A new
  size, Full screen, that is the whole glass edge to edge -- on the V2 and
  the V1, upright or on its side -- from one choice rather than a number of
  cells per shape. It sits in the corner and cannot be dragged off it, is
  never framed (the Border option goes away for it), and covers the page's
  chip row; turn the row off for a picture with nothing on it.

- 5x3, 2x4 and 3x6 are still offered as large cards.

## 2026.9.68

Pairs with firmware **v2026.9.68**. Update the add-on first, then the panels.

- **A photo album can fill a panel on its side.** Two new sizes for the
  sideways layout: 3x6, the whole of the panel, and 2x4, a tall card beside a
  column of others. With no frame and no chip row, 3x6 runs to the edges of
  the glass the way 5x3 does lying down.

- The size buttons only offer sizes that fit the layout being edited. The
  panel now sends the sizes for both ways up, so an upright page is never
  offered 3x6.

## 2026.9.66

Pairs with firmware **v2026.9.66**. Update the add-on first, then the panels.

- **The calendar card shows your calendar.** Every size used to show only the
  next event, because that is all Home Assistant puts on the calendar entity.
  The add-on now reads each calendar in your layout every fifteen minutes, and
  straight after a layout change, and sends the panel up to twelve upcoming
  events per calendar in Home Assistant's time zone. All-day and multi-day
  events included.

- **Choose how often a changing reading may repaint the panel.** The Screen
  refresh card has a new setting: every change, 30 seconds (the default), 1, 5
  or 15 minutes. A sensor that publishes every few seconds no longer repaints
  the whole panel each time, and nothing goes stale on a page with a clock.

- **"The panel disagrees" shows again.** When a setting was changed with the
  panel's own buttons, the Device screen was meant to say so, and had not
  since the redesign.

- A full-screen photo without a frame on a page with a chip row is rendered
  at its card size rather than the whole panel, matching the firmware, which
  no longer runs it under the chips.

- The panel sends the list of pictures on its card only when it changes, and
  the add-on remembers the last one — so the Images tab keeps working with
  firmware v2026.9.66, which sends far less over WiFi.

- Widgets that exist only in a page's sideways layout now have their
  Home Assistant entities followed.

## 2026.9.65

Pairs with firmware **v2026.9.65** — update both.

- **Widgets sit exactly on their cells.** Every widget picture in the editor was
  drawn a few pixels beside its own box — 4px right and 8px up on an Inkplate 5
  V2, 5px left and 12px down on an Inkplate 5 — so a card snapped onto a cell
  looked as though it had missed it. The pictures are placed where the panel
  draws them now.

- **The chip row lines up.** The grid behind the canvas and the chip band were
  drawn a few pixels off the margin that widgets actually snap to. Chips left
  above the row by an older layout are put back into it, and chips piled on top
  of one another are spread along the row in their order. The layout is saved
  when this happens, so the panel gets the same row.

- **The battery chip is where the editor shows it.** The editor reserved the
  Inkplate 5 V2's chip widths on both panels. The Inkplate 5 draws its battery
  49px narrower, so a battery pushed against the right margin landed well away
  from it. Chips are now as wide in the editor as on the panel (needs firmware
  v2026.9.65).

- **An old layout is moved onto the current grid.** A layout last edited before
  every panel shared one cell size was still on the old grid. The panel quietly
  corrected it, but the next push would have stopped that and put the chips
  17px above their row. It is moved once when it is loaded: cards keep their
  cells, and chips keep the margin they were against.

## 2026.9.64

- **Widgets are the right size in the sideways layout.** A card's size was taken
  from the numbers the panel published, and those describe whichever way the
  panel is standing — so with the panel upright, every multi-cell card in the
  sideways layout was drawn 15px wider than its own cells, overhanging the gap
  and its neighbour, and chips were 14px short of the chip row they sit in. Cards
  now take their size from the grid of the layout you are editing, so both
  layouts snap and line up whichever way the panel happens to be standing.

- A new chip starts at the margin rather than a few pixels inside it, which is
  where a chip dragged to the edge stops.

- **Screenshots work on a panel standing on its side.** An Inkplate 5 in portrait
  refused every screenshot with a 400, and an Inkplate 5 V2 would have returned a
  scrambled one without an error. A panel always sends its picture in the shape
  of its glass, whichever way up it is standing, and the add-on was reading it as
  the shape the panel was standing in.

- **The Pages tab shows the layout you are editing.** With the sideways layout
  open, every page thumbnail was a sideways box holding the *upright* layout, at
  upright positions — cards out through the right-hand edge, and a widget count
  that disagreed with the picture beside it.

- **Switching to the sideways layout no longer moves your upright one.** The
  check that rescues widgets stranded off the panel was measuring the upright
  layout against the sideways panel, so switching swept every card past the
  halfway point into the top-left corner — and saved it, repeatedly, without
  asking. If a page looks wrong after turning the panel, this was why.

- The canvas fits the panel's long side, so a sideways page is drawn whole
  instead of at full size with only its top third on screen. Both layouts are now
  shown at the same scale as each other.

- Turning a page's chip row off clears the chips from **both** layouts, not just
  the upright one, and re-spaces each against its own grid.

## 2026.9.62

- **Each page now has an upright layout and a sideways one, edited separately.**
  Before this a page had a single arrangement, so turning the panel re-flowed it
  and the next save wrote that re-flow back over the original — laying out
  sideways cost you the upright layout, and turning back cost you the sideways
  one. The toolbar switches between the two, and the canvas turns with it, so the
  sideways layout can be built from an upright panel.

- A page you have never laid out sideways shows the upright one fitted to the
  narrower grid — exactly what the panel draws for it — marked *(auto)*. The
  first edit turns that into a real sideways layout, so you start from what was
  already on the panel rather than from an empty page. Cards with no room on the
  narrower grid are dropped, as they always were.

- Album photos are rendered for both layouts, so a photo widget that only appears
  in the sideways one has its pictures ready before you turn the panel.

  Needs firmware v2026.9.55.

## 2026.9.61

- **The panel can stand on its side.** Orientation offers all four ways up, not
  just the two. A quarter turn swaps the panel's width and height and turns the
  grid with it — a V2 becomes 3 columns by 6 instead of 5 by 3, an Inkplate 5
  becomes 2 by 4 — and the panel republishes its manifest, so the editor
  re-shapes itself within a second. Widgets that no longer fit the narrower grid
  are dropped from the page, the same way a layout built for a V2 is fitted when
  it arrives at an Inkplate 5.

- **One cell everywhere: 210×172.** Both panels, both ways up. A widget is now
  the same picture on every screen, which is what lets one set of renders and one
  set of album pictures serve all four shapes. The cell was 220×166 on the V2 and
  215×202 on the V1, so **every dashboard shifts slightly** — the cards keep their
  cells, but the gaps and margins around them change.

- **A page without a chip row no longer grows its cards.** They used to get taller
  (166 → 200); now they keep their size and centre in the height the row gives
  back. That also halves the album pictures a mixed layout needs, since the same
  widget no longer has two footprints.

- Album pictures are re-rendered at the new sizes on the next refresh: the
  footprint is part of the filename, which is exactly what that naming is for.

  Needs firmware v2026.9.54.

## 2026.9.60

- **Fixes the Inkplate 5's widget previews: the chip row's were missing and the
  rest sat 10px out of place.** The previews are real renders from the firmware,
  and each carries the offset it should be drawn at. Those offsets were measured
  against the V2's 30px margin rather than the V1's 20px — so every card was
  placed 10px out, and a chip, which the simulator had quietly moved into the
  chip row before rendering it, was placed 434px below its own box: off the
  bottom of the canvas, leaving the transparent blocks.

  The pictures themselves were right the whole time; only where to put them was
  wrong. Every PNG in the set is unchanged.

## 2026.9.59

- **Fixes chips not landing where you put them on an Inkplate 5.** A layout is a
  list of pixel positions, and the panel was never told which grid those pixels
  were measured against — so it assumed the V2's and rescaled its own layout
  accordingly. A chip placed against the right-hand margin at x=720 arrived at
  540, a quarter of the panel short of it. Cards were spared, being re-placed by
  cell. Every layout now says which grid it was drawn for.

- **Fixes the editor drawing an Inkplate 5's widgets at the wrong size.** The
  previews are real renders from the firmware, and only the V2's existed: a card
  is laid out for the box it is given — 215×202 against 220×166 — so every card
  on that canvas was 26px over its own footprint and up to 56px short of it.
  There is a set of renders per panel now, chosen by the model the panel reports.

  Both need no firmware update: v2026.9.51 and later already understand
  everything this sends.

## 2026.9.58

- **The weather card has a 2x2**, between the 2x1 strip of five days and the
  3x2. It stacks what the 3x2 puts side by side: today across the top — icon,
  temperature and condition — with the coming five days as columns beneath. Needs
  firmware v2026.9.53, which is what offers the size; this release is the preview
  the editor draws beside it.

## 2026.9.57

- **The icon picker shows the icons.** It was a list of names — a dropdown of
  seventy-one on a desktop, rows of `entity_roller_shades_closed` on a phone —
  which asks you to know in advance which drawing each name stands for, and to
  tell two apart by reading them. It is now a grid of the outlines the panel
  actually draws, grouped into Lighting, Climate, Air, Doors and windows,
  Security, Media and Power, with the search still there for going straight to
  one. A list short enough to take in at once, like the room card's ten, is left
  as a plain grid with no headings over it.

  The option's row shows the icon beside its name too, so a widget's settings can
  be read without opening anything.

  The outlines are the firmware's own, copied over by `tools/icon-glyphs.py`.
  Which icons exist is still the manifest's to say: a firmware newer than this
  add-on lists its new icon immediately, shown by name until the drawings are
  copied across again.

## 2026.9.56

- **Converting a picture is about three times faster**, and the picture it
  produces is the same one to the byte. Three things were paying for it:

  - The preview PNG the editor shows was widened from the 1-bit image it is to
    8-bit greyscale before being saved with `optimize=True` — eight times the
    data for zlib to chew through and a filter search over all of it. On a
    full-screen picture that alone was 467ms of a one-second conversion, and it
    produced a *larger* file. Saved as the 1-bit PNG it is: 4ms, 20KB smaller,
    same pixels.
  - Packing the bitmap into the panel's format was a Python loop over every
    pixel — a million shift-and-tests for a full-screen picture. Pillow's own
    1-bit buffer already *is* that format apart from the polarity, so it is now
    a byte-table flip in C: 88ms to 0.4ms.
  - The dither, which is the rest of it, now skips the bounds checks for pixels
    that cannot be near an edge. The arithmetic is untouched, deliberately: the
    editor's live preview dithers in JavaScript and the two have to agree to the
    bit.

  A full-screen photo went from 1.6s to 0.55s, and an album of ten photos on two
  panels from about twelve seconds to four.

## 2026.9.55

- **Fixes photo widgets showing ALBUM IS EMPTY.** Album refreshes have been
  failing since panels became separate: the refresh takes each layout with the
  grid it is drawn against, and it was still being handed bare layouts, so it
  raised before rendering anything. Nothing new was rendered — which only shows
  on a panel asking for a picture size that had never been rendered before, so
  an Inkplate 5 beside a V2 drew an empty card while the V2 looked fine.

## 2026.9.54

- **Fixes screenshots from the Inkplate 5 (960×540).** A screenshot is the
  panel's framebuffer verbatim and the two panels' are different sizes — 115,200
  bytes against 64,800 — but the length was checked against one of them, so the
  smaller panel's picture was refused as a truncated upload every time:
  `Expected 115200 bytes of framebuffer, got 64800`. The size now comes from the
  sending panel's own grid, and a genuinely wrong length says which panel it was
  expecting.

## 2026.9.53

- **The `firmware_model` option is gone.** Which board a build was for is read
  from the release's own asset names, and which board the one legacy offer
  carries is worked out from the panels — a panel that is behind gets it, and a
  panel still running firmware that can only read that topic keeps it. Nobody
  should have to know that setting, and getting it wrong decided which panel was
  allowed to update.
- **Firmware offers now follow the panels.** A panel switched on after the
  add-on started is offered a build straight away, rather than waiting for a
  restart or a new release. This is what left the first Inkplate 5 with no
  update showing while the V2 beside it updated fine.

## 2026.9.52

- **Fixes saving a layout, which answered 500 in 2026.9.51.** Announcing a
  panel to Home Assistant referred to a name that only exists in another
  function, and the line was reached as soon as a panel had reported what
  firmware it was running — which is to say, always, in a real install. Every
  edit in the editor failed; pushing was unaffected.

## 2026.9.51

Ships with firmware `v2026.9.51`, and the two go together: this version talks
to panels on their own topics and the old firmware does not answer there.
**Update the add-on first, then the panels** — each panel keeps drawing its
stored dashboard while it waits.

- **Several panels, each with its own dashboard.** A panel introduces itself
  the moment it is switched on; nothing is paired or configured. It gets its
  own pages, widgets, orientation, screen refresh, night sleep, timers,
  history, screenshot, boot log and Home Assistant device. The identity in the
  editor is now a dropdown; rename a panel there, and forget one that has gone
  for good — its dashboard is kept either way.
- **The Inkplate 5 (960×540) is supported alongside the V2.** The firmware is
  one source tree built for both, and the editor draws the grid each panel
  publishes: 5×3 cells of 220×166 on a V2, 4×2 of 215×202 on a V1.
- **A release now carries a binary per board**, and each panel is offered the
  one built for it. The images are not interchangeable — the wrong one needs a
  USB cable to undo — so a panel refuses an offer that is not its own.
- **`image_base_url` is read as an address rather than a URL.** `192.168.178.35`
  becomes `http://192.168.178.35:8098`. Typed without a scheme it used to cost
  the images, the boot log and the HTTP manifest, silently.
- **On a phone**: the editor toolbar drops what the widget sheet already
  carries, the sheet rises instead of snapping open, a big option opens on a
  screen of its own with a searchable list, and the Device screen is a list of
  settings rather than every one of them expanded.

## 2026.9.49

Ships with firmware `v2026.9.49`. **Install this add-on before updating the
panel** — this version understands what the new firmware sends, and the old one
does not.

- **The panel was often unreachable for the first minute and a half after
  switching on, and sometimes for the whole session.** It described everything
  it can draw in one 15KB message, and its WiFi could not reliably push a
  message that large — the send would stall for ten seconds, go out half
  finished, and take the connection to Home Assistant down with it. Everything
  the panel tried to say afterwards failed the same way, ten seconds at a time,
  and while that was happening the panel was frozen: no button worked and
  nothing redrew.
- **It sends that description over the ordinary web connection now**, the same
  one it already uses for pictures, firmware and its startup log. On the panel
  here it went from failing on six starts out of six to arriving in a tenth of
  a second on every one.
- **The description is also a fifth smaller**, because lists that used to be
  repeated on every widget — the icon lists, the update-interval choices — are
  now sent once.
- **A panel running older firmware works exactly as before.** Both ways of
  sending are still accepted.
- Fixed: the panel could spend a minute and a half checking its stored pictures
  in one go, which dropped it off Home Assistant while it did.

## 2026.9.48

Add-on only. Firmware stays on `v2026.9.44`.

- **Editing a widget on a phone is a sheet that rises over the canvas.** It was
  another block on the edit page: you tapped a widget, then scrolled past the
  canvas and the page list to find its options — by which point the thing you
  were editing was off screen. The sheet comes up from the bottom edge at three
  heights. Pull it up a little for a summary of what is selected; up again for
  the form, with the panel still visible above it; all the way up for a long
  option list, with the panel dimmed to a strip you can tap to come back down.
- **Raising it brings the panel to the top of the screen**, so the widget and
  its options are in view at the same time.
- **Drag the handle**, tap it, or tap the summary row — whichever is nearer
  your thumb. The sheet follows your finger and settles at the nearest height.
- **It gets out of the way while you drag a widget** across the panel, and
  comes back where it was when you let go.
- **Duplicate and Delete are in the sheet**, pinned below the options rather
  than in the toolbar above the canvas, which is off screen whenever the sheet
  is open.
- **Three fixes found while building it.** A field named with a plain label —
  Name, and the dropdowns — was drawn as an oversized heading instead of a
  field label. Dismissing an entity or room picker also collapsed the sheet
  that opened it. And the page could not scroll far enough to lift the panel
  clear of the sheet, so it stayed half covered.

On a tablet or a desktop nothing has changed: the options stay in their column
beside the canvas.

## 2026.9.47

- **The photo picker's thumbnails now actually appear.** Every tile in
  2026.9.46 was a broken image: thumbnails are filed one directory per album
  and only the parent directory was being created, so each one failed to save
  and came back as a 404.

## 2026.9.46

Add-on only. Firmware stays on `v2026.9.43`.

- **You can see an album's photos, and choose which ones the panel shows.**
  Opening an album in the Images tab now shows every photograph in it as a
  grid — tap to include or exclude. The only control before was “keep the
  newest N”, which is a poor way to say which pictures you want and gave no
  way to see what it had picked short of walking over to the panel.
- **The photo limit is still there for albums you have not chosen for**, which
  is every album that exists today — nothing changes until you open the
  picker. “Use the limit instead” hands an album back to it.
- Changing which photos are shown renumbers the album, so the panel re-fetches
  the ones that moved. The picker says so.

## 2026.9.45

Firmware-unrelated: this is an add-on-only fix for 2026.9.44 not actually
taking effect.

- **A full-screen photo already rendered under the old, bordered-looking size
  now corrects itself.** The check that decides whether a picture needs
  re-rendering only compared its source photo against what iCloud last served,
  so a picture whose *pixels* were supposed to change -- like 2026.9.44's
  full-screen bleed -- but whose source photo had not, was never redone. Hit
  Refresh in the Images tab (or wait for the next poll) to have an affected
  album correct itself immediately rather than in up to six hours.

## 2026.9.44

Pairs with firmware `v2026.9.43`.

- **A full-screen photo with its border off now fills the whole panel.** It
  used to sit inside the same 30px margin every card does, which read as a
  border on a widget meant to cover the entire screen. A photo widget with a
  chip row on its page, or with the border left on, is unaffected.

## 2026.9.43

Pairs with firmware `v2026.9.42`.

- **The Pages screen can lock and unlock the panel itself.** Locking a page used
  to mean walking over to the device and holding its right button; the live
  row now has a padlock button that does the same thing over MQTT. The page
  held that way shows a padlock instead of a dot.
- **The button that puts a page on the panel now shows an eye, not a
  checkmark** — the checkmark read as marking correctness, and this action
  never was that.

## 2026.9.42

Photo album fixes, all found on a real panel the day albums shipped.

- **An album's photos could be deleted while you were editing.** Saving a layout
  rewrote the file in place, truncating it for an instant; the album refresh
  runs in the background, and if it read the layout in that instant it saw no
  widgets at all and concluded nothing wanted the pictures it had just
  rendered — so it deleted every one, and the widget drew ALBUM IS EMPTY until
  something made it render again. The layout is now written whole and renamed
  into place, which was a risk to every part of the add-on that reads it, not
  just to albums.
- **A refresh will no longer delete pictures it cannot account for.** An album
  that iCloud refuses, or that answers with nothing — which is exactly what a
  shared album looks like when its download links fail to arrive — keeps the
  pictures the panel already has.
- **An edit made while an album is rendering is no longer lost.** It used to be
  skipped, and since rendering takes minutes the change thrown away was always
  the most recent one: resize a widget mid-render and the new shape never
  appeared.
- **A widget with no pictures is retried every ten minutes** rather than waiting
  up to six hours for the next scheduled read.
- **"25 of 35" now reads "newest 25 of 35".** That was the photo limit doing what
  it was set to, but nothing said so, so it looked like a job that had stalled.
  The album's own pane now says how many photos are being left out and how to
  change it, and an album still working through its photos says it is rendering.
- **The rendered count counts photographs, not files.** An album shown at two
  different widget sizes is rendered twice over, and adding the files up
  reported more pictures than the album contains.

## 2026.9.41

**Photo albums.** A new photo widget rotates through an iCloud shared album.
Needs firmware v2026.9.41.

- **Add an album on the Images screen.** In Photos, share an album, turn on
  *Public Website*, and paste the link. Nothing is signed in to — the link is
  all iCloud needs, and the add-on only ever reads. Albums sit beside your
  uploaded pictures in the side column, because an album is another thing a
  widget can show; the widget itself just names one, so several widgets can
  share an album without pasting the link again.
- **The widget comes in four sizes** — landscape, portrait, large and full
  screen — and takes how often to change picture, whether to crop to fill or fit
  the whole photo in, and whether to draw a border.
- **Pictures are rendered only for the widgets that show them**, at each size,
  crop and border in use. Each one is cropped and dithered here, at a few
  seconds apiece, so albums keep the newest 25 photos by default. Adding a photo
  to the album on your phone only costs the panel that one photo.
- Albums are re-read every six hours, or on demand with **Refresh**. An album
  iCloud will not serve keeps the pictures the panel already has and says what
  went wrong.
- Apple publishes no API for shared albums, so this speaks the same
  undocumented endpoint their own web viewer uses. It could break if they change
  it; nothing else in the add-on depends on it.

## 2026.9.40

- **The tab bar reaches the bottom of the screen on a phone.** It was ending
  short, with a strip of a different colour beneath it, and sat higher than a
  tab bar should. Home Assistant stops the add-on's frame above the home
  indicator and fills that band itself, so the add-on now gives the band the
  bar's own colour and stops adding clearance on top of clearance it was already
  being given. The labels sit where iOS puts its own.
- The tab bar is a flat colour rather than a frosted one. It is the same shade
  it always rendered as — a translucent bar has no fixed colour to match the
  band to, and the join would have shimmered as the page scrolled behind it.

## 2026.9.39

Phone fixes, all of them found on one.

- **Diagnostics no longer scrolls sideways.** The firmware card's two buttons
  hung off the edge of the card and dragged the width of the whole page with
  them, so everything sat shifted with its left edge off-screen.
- **The screenshot from the panel is the right shape.** It was stretched tall on
  any screen narrower than the panel itself.
- **"Running 1.6.2 → Offered 1.7.0" reads as words again** rather than running
  together into one unbroken line.
- **The Images screen no longer scrolls sideways either.** Nothing was visible
  there to explain it — an invisible element was hanging off the side of the
  page.
- **The device card is the first thing in the editor on a phone.** Which panel
  you are editing onto, whether it is awake and whether anything is waiting to
  be sent are what you open the editor to find out, and Push is the button you
  came to press; it was below the canvas and the page list.
- **No more bare white strip under the tab bar**, and the icon in the device
  card sits in the middle of its circle instead of the corner.

## 2026.9.38

- **Fixes the orientation being the wrong way round.** Since 2026.9.19 the two
  choices have been labelled backwards: a panel nobody had touched showed
  "Upside down" as its setting, and choosing "Upright" turned it over. 0° is
  upright, which is what the firmware has always meant by it. Only the labels
  change — if your panel is the right way up today, it stays that way and there
  is nothing to redo. If you had picked "Upright" to correct it, pick "Upside
  down" once and it will agree with itself again.
- **Waiting on the panel no longer looks like a missed Push.** The two states
  wore the same colour and call for opposite responses. A sleeping panel now
  says so in its own colour, and says that pushing again will not help — it
  collects the layout when it next wakes.
- **When the panel refuses a layout, it says why on screen.** The reason was
  only ever a tooltip on a badge, which is no use on a phone. The Device screen
  now leads with what the panel is showing against what is stored here, and what
  to do about it.
- **Pickers say why they are empty.** An option that only accepts one kind of
  entity now says so instead of just looking like a short list, and lists that
  are empty because the add-on has no Home Assistant credentials say that rather
  than looking like an empty house.

## 2026.9.37

- **The Device, Images and Pages screens are rebuilt**, and the editor's toolbar
  with them. 2026.9.36 brought the new look to the chrome and the canvas; this
  finishes the other three screens rather than re-painting the old ones.
- **The toolbar is one bar again.** Snap, zoom and the chip row sit on the left,
  then bring-to-front, send-to-back, duplicate and delete for whatever you have
  selected, then undo and redo at the far edge and Add widget. The strip of view
  controls that used to sit under the canvas is now a line that simply tells you
  the grid you are snapping to and where the chip row is.
- **The chip row is back in the editor**, as a menu in the toolbar. It was on
  each row of the Pages screen, where you had to choose it without being able to
  see what it did — turning it off gives every card the chip row's height and
  moves every widget on the page.
- **Front, back, duplicate and delete are in the toolbar** rather than only in
  the options panel on the far side of the canvas. They are gone from the panel,
  so there is one of each rather than two.
- **Pages says what a rotation adds up to.** A card beside the list gives the
  full cycle as a clock, with each page's share of it drawn to scale. The
  rotation switch and the default dwell moved up into the header. Each row is a
  Queued/Paused pair rather than a toggle labelled with only one of its states,
  and Edit, Show and Delete are icons.
- **Device splits settings from diagnostics.** Orientation, refresh, night sleep
  and timers are a grid of cards, with what the panel itself reports — including
  any setting changed on the device — in a column beside them. Battery history,
  the log and the firmware are behind Diagnostics.
- **Images shows the picture and the result side by side.** Choosing a file
  gives you the source with a crop you can pan and zoom, and the actual 1-bit
  dither the panel will draw, next to each other rather than one after the
  other.
- Nothing about how the panel is driven has changed, and nothing in a layout
  needs redoing. Same firmware as 2026.9.35.

## 2026.9.36

- **A new look.** The editor is rebuilt on a design of floating glass panels
  over a warm ground: translucent cards, soft depth instead of hard shadows,
  round corners throughout, and a single blue-to-violet gradient kept for
  whichever action actually matters on the screen you are looking at.
- **The header and its tabs are gone.** The four sections — Editor, Pages,
  Device, Images — are a floating rail down the left on a desktop and a tab bar
  along the bottom on a phone, so the chrome above the canvas is a bar rather
  than three bands.
- **The device moved in beside the pages.** Which panel it is, whether it is
  online, its battery and signal, how many edits are waiting and the Push button
  are one card at the top of the editor's left column, under a list of your
  pages — so what you are editing and what you are editing it onto are in the
  same place.
- **A page is recognisable by its shape.** Rows on the Pages screen now carry a
  real render of the page at thumbnail size rather than only its name.
- **Dark mode is gone for now.** The design is light only. The editor no longer
  follows Home Assistant's theme; a dark version may come back later.
- Nothing about how the panel is driven has changed, and nothing in a layout
  needs redoing. Same firmware as 2026.9.35.

## 2026.9.35

- **Fixes the panel's timer restarting itself.** Pausing did not stop it, the
  duration under the count kept changing and the ring kept resetting. The
  timer helper and the panel were starting each other: Home Assistant emits a
  state change before it answers the call that caused it, so the add-on's own
  `timer.start` came back looking like somebody else's and was sent on to the
  panel as a start. A start restarts a running timer, and the seconds it
  carries become the new duration.
- **The helper is no longer restarted twice a minute.** The panel republishes
  its timer every 30 seconds to keep the retained message fresh; each of those
  was being mirrored as a fresh `timer.start`.

Numbered to match the firmware it belongs with. Needs firmware 2026.9.35.

## 2026.9.32

- **Holding the right button on the panel now locks the page it is showing**,
  and holding it again lets the rotation run on. A dot in the bottom right
  corner says the lock is on; the panel forgets it on a reboot.
- **The editor says so too**: the page bar reads "live · locked", the Pages
  list marks the page, and the Rotation settings admit the cycle is paused
  rather than describing one that is not running.
- Holding the right button used to send the log. That is still on the Home
  Assistant command and still sent on every boot.

Needs firmware 2026.9.32.

## 2026.9.31

- **The timer helper now follows the panel.** Starting a timer on the panel
  had no effect in Home Assistant: the mirror was trying to do its work on the
  wrong thread and threw every time.
- **The panel no longer publishes its timer state every second**, and the
  finish time it sends is no longer truncated -- it was malformed, which is
  what stopped Home Assistant reading any of it.

Needs firmware 2026.9.31.

## 2026.9.30

- **Fixes 2026.9.29, which could not start at all.** A broken import crashed
  the add-on on boot and it restarted in a loop. If you are on 2026.9.29,
  this is the fix; nothing else has changed.

## 2026.9.29

- **The panel's timer, in Home Assistant.** Set a duration, start, pause and
  cancel it, and see what it is doing -- from a dashboard, an automation, or
  the panel itself. Whichever you use, the other follows.
- **A real timer helper**, `timer.inkplate5v2_timer`, created for you and kept
  in step, so the timer card and `timer.finished` work as they would for any
  other timer.
- To start one from an automation in a single step, publish
  `{"action": "timer_start", "seconds": 1500}` to `inkplate5v2/command`.

The panel owns the timer: Home Assistant asks, the panel decides and says what
happened. So it keeps working with Home Assistant switched off, and nothing is
lost if the add-on restarts mid-countdown.

The pomodoro is not exposed. It and the timer share one clock on the panel, so
starting a timer from Home Assistant stops a pomodoro that was running.

Needs firmware 2026.9.29.

## 2026.9.28

- **The one-second timer update is gone; 2.5 seconds takes its place.** The
  panel cannot watch its buttons while it redraws the screen, and at one
  second it was redrawing more than half the time, so presses went missing.
  A layout still set to one second moves to 2.5.

Firmware 2026.9.28 also reworks setting a time on the panel: left and right
walk between hours, minutes and seconds, the middle button starts and stops
changing the number under the cursor, and holding left or right moves it by
ten.

## 2026.9.26

- **Pomodoro auto-start.** On the Display tab, beside the timer redraw rate.
  Turn it off and a focus block or break ends and waits on the panel until you
  press the middle button. Changeable on the panel too, either way round.

Firmware 2026.9.26 goes with it: skip a phase by holding the right button,
dial a time in by holding to count up rather than pressing forty-five times,
and the buttons no longer go unresponsive when the timer is set to update
every second.

## 2026.9.25

- **Choose how often a running timer redraws.** On the Display tab: every
  second, or every five. It can also be changed on the panel itself, and
  whichever you use, the other one follows.

Firmware 2026.9.25 goes with it: the countdown now lands on whole numbers
rather than counting in fives from wherever it started, the pomodoro's blocks
before a long break can be set, and the button legend from the timer screens
is now on the menu and settings too.

## 2026.9.24

- **New firmware is noticed within five minutes.** The releases check ran every
  six hours, so a new version could sit there most of a day unless you pressed
  Check now. Each poll is a single request and the binary is only downloaded
  when the version has actually changed, so an up-to-date panel costs nothing.

No firmware change in this one; 2026.9.23 is still current.

## 2026.9.23

- **"Normal" is now the way the panel actually hangs.** The two orientations
  swapped names: what was called Upside down is Normal, and the other way
  round. Only the words changed — the stored value is the same, so no layout
  needs touching and nothing on the panel moves.

Firmware 2026.9.23 adds a timer and a pomodoro to the panel's own buttons,
reachable from the menu. Nothing in the editor configures them: the durations
are dialled in on the panel, which is the point of them.

## 2026.9.21

The three buttons on the panel do something. Until now the only way to change
anything was the editor, which is no use when the broker is down — which is
exactly when you walk over to the panel.

- **Left and right turn the page, and the middle button opens a menu.** From
  there: settings, the page list, and a diagnostics screen. Holding the middle
  button clears the panel, holding the left one sends a screenshot to Home
  Assistant, and holding left anywhere below the dashboard goes back.
- **Settings changed on the panel win, and are told to the add-on.** Orientation,
  refresh mode and night sleep can all be changed by hand. The panel publishes
  what it is overriding, the add-on merges it into the stored layout, and the
  panel then drops the override — so a later change in the editor is still
  obeyed. Without that last step the layout is retained and would have undone
  the change within seconds of the next reconnect.
- The editor shows a note on the Display tab when the panel is overriding a
  setting, so the two do not silently disagree.

## 2026.9.20

The editor, redesigned. It had grown by accretion: on a phone the Design tab
stacked six full-width bands before the canvas, and two of the toolbar's four
groups sat off-screen with nothing saying so.

- **Three bars instead of six.** The header holds one row at every width. The
  toolbar is gone: the chip row is a page setting and moved to the Pages tab,
  snap and zoom describe the canvas and are docked to it, and undo, redo and
  duplicate are buttons on the page bar. Messages are a toast now, so sending a
  layout no longer shoves the editor down and lets it spring back.
- **Choosing an entity is a browser, not a list.** Room, then what kind of
  thing, then the entity -- and typing at any point searches everything and
  skips the steps, because if you know the name you should not have to walk
  them. A step with only one answer is skipped rather than asked.
- **The kinds are things, not domains.** Temperature, Humidity, Air quality,
  Lights, Doors and windows. Sorting by Home Assistant's domains barely helped:
  most of an install is `sensor`.
- **Adding a widget is a picker** with search, groups and a picture of each
  widget, replacing the rail down the side of the workspace. The groups come
  from the panel, so a widget added in a future firmware arrives already filed.
- **Queue is now Pages**, which is what it always was -- the old name was a
  checkbox on a page rather than the page itself. Reorder by dragging the
  handle; it was two arrow buttons per row, which is eleven clicks to move the
  last page to the front. Works by keyboard too.
- **Forcing a page names it.** It said "Showing page_a3f9c1" -- an id the editor
  makes up and shows nowhere else. The Page control in Home Assistant listed
  those ids as its options; it lists names now.
- **The Device tab is four sections** -- Status, Display, Firmware,
  Diagnostics -- and several hundred words of explanation are gone. Most of it
  was only true when something was wrong, and is shown then.
- **Images asks in three steps**, and a step it cannot ask yet is not shown.
  The size is a small picture of the panel's grid that you sweep the shape out
  of, instead of a row of "1 wide, 2 wide..." and another of "1 tall, 2
  tall..." -- two numbers for one rectangle, picturing neither. Custom sizes
  are sliders with the pixel count beside them.
- Fixed: picking an entity announced the field's name rather than the entity to
  a screen reader; dragging a page to the top quietly changed which page the
  Design tab was editing.

Needs firmware v2026.9.20 for the widget groups. Without it the picker still
works and shows one list.

## 2026.9.19

- **The panel can be turned upside down**, from the Device tab. For a screen
  mounted the other way up: the dashboard is drawn the other way round and the
  layout is untouched, so every widget stays exactly where it was put.
- Only normal and upside down. A quarter turn would swap the panel's width and
  height, and widgets are placed in pixels against a 1280x720 grid, so it would
  not be one setting -- it would be a second grid and a second size for every
  widget.
- The screen flashes once when it changes. Every pixel means something
  different afterwards, so a quick update would leave the old picture ghosted
  through the new one the wrong way up.
- Screenshots stay the right way up either way: the panel reports which way it
  is drawing and the add-on turns the picture back.
- Existing dashboards are unaffected -- they read as normal, which is how they
  already look.
- Needs firmware **v2026.9.19** or newer. Older firmware ignores the setting
  and keeps drawing the way it always has.

## 2026.9.16

- **A button to send the panel back to setup**, on the Device tab. It restarts
  into its own WiFi network so it can be pointed at a different one — after
  moving, or replacing a router. This is the one fault nothing else can reach:
  the panel's credentials are perfectly valid and simply join the wrong
  network, so it will never work that out by itself, and this page is on the
  network it can no longer see.
- Nothing is erased. The panel keeps its layout and its current settings until
  somebody completes the setup form on its screen, and the confirmation says
  so — "set up again" reads like a factory reset and is not one.
- Needs firmware **v2026.9.15** or newer. On anything older the panel simply
  logs the command as unknown.

## 2026.9.14

- **A photo can be framed before it is uploaded.** Choosing one now opens an
  editor: the target shape is a fixed window, the photo drags and zooms behind
  it, and the black-and-white preview beside it is exactly what the panel will
  draw — dithered live as you move, not after the fact. Before this, an upload
  was cropped from the centre and you found out afterwards.
- **Brightness and contrast, applied before the dither.** On a screen with no
  grey these matter more than the framing does: a slightly dark photo turns to
  mud, and a nudge of contrast often rescues one that looked hopeless.
- **A choice of dither.** Atkinson stays the default and is the right one for
  photographs. The one worth knowing about is **No dither** — a logo, a QR code
  or line art turns to noise under any of the others, and previously the only
  way to get a clean one was to draw it at exactly the right size and upload it
  as Pixel accurate. Now it can be scaled like anything else.
- **Rotate and mirror**, for the picture that is nearly right.
- **Photos from a phone are no longer sideways.** A picture taken in portrait
  records that fact separately from the pixels, and the add-on was ignoring it
  and cropping along the wrong axis. Reported from a real upload.
- **The widget pictures in the editor are redrawn** for the outline icons in
  firmware v2026.9.14, so the couch, humidity and heat glyphs on the canvas
  match the ones on the panel again.
- **Room cards in the palette show their thermostat.** They had been drawing an
  empty badge reading "--" since the room card's settings were reworked.
- Needs firmware **v2026.9.14** for the icons to match. Everything else here
  works with any firmware that supports images.

## 2026.9.12

- **Picking a room fills the whole card in.** The temperature, humidity, PM2.5,
  CO2 and the thermostat each have a setting of their own now, filled in from
  the room you choose, and everything else in the room becomes the list the card
  counts — the lights, plugs, speakers and windows. Every one of them stays
  editable afterwards.
- **You can say which sensor belongs on the card.** Before, the card searched
  the same list it counted and took whatever it found first, so a room with two
  temperature sensors showed whichever happened to be ranked higher, with no way
  to change it.
- **The thermostat is no longer counted as a thing in the room.** It describes
  the room; it is not one of its plugs.
- **Humidity is shown as a whole number.** A tenth of a percent is noise, and on
  the narrow sizes it cost a fifth of the band to say nothing.
- **A Copy button on the device log**, so it can go straight into a message or
  an issue without selecting a few hundred lines by hand.
- Needs firmware **v2026.9.12**. A room card made before this keeps drawing
  exactly as it did; pick its room again to fill the new settings in.

## 2026.9.11

- **The screenshot is the right way up.** The panel keeps its screen in its own
  orientation, which is upside down from the way it draws, so the first
  screenshots arrived inverted. The device now says which way up it was drawing
  and the picture is turned to match.
- Needs firmware **v2026.9.11**. A panel still on v2026.9.10 is also shown the
  right way up — that version cannot say which way it was drawing, so the
  rotation it uses is assumed.

## 2026.9.10

- **The panel can send you a picture of its screen.** The Device tab has a
  Screen section with a button that asks for one, and it arrives as the panel
  drew it. It is also a **Screen** entity in Home Assistant, so a captured
  picture can sit on a dashboard there, with a button beside it to take a fresh
  one.
- **And its log.** The panel keeps its last few kilobytes of output and sends
  them when asked — and **once on its own after every boot**, which is the copy
  worth having: a slow WiFi start or a broker refusing the password happens
  during startup, long before anyone thinks to look. Read it in the Device tab
  under Log.
- Every line the panel prints now carries a timestamp: the time of day once its
  clock is set, and seconds since it started up before that.
- Needs firmware **v2026.9.10**.

> Both uploads arrive on the add-on's plain device port — the same one the panel
> already fetches images from — and are **not authenticated**. Anything on your
> network could post a screenshot or a page of log and the add-on would believe
> it.

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
