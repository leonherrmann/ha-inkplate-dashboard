// Real renders of each widget, generated from the firmware sources by the
// firmware repo's sim/screenshots.py and committed here. Regenerate with:
//
//   python3 sim/screenshots.py \
//     ~/…/ha-inkplate-dashboard/dashboard/frontend/src/widget-shots
//
// run from the firmware repo. The editor used to approximate every widget in
// CSS by hand and the two drifted apart repeatedly -- 0.17.1 shipped "the
// battery preview matches the firmware again" as a bug fix. A picture taken
// from the firmware itself cannot drift.
//
// Nothing here is registered by hand: a shot is used if a file for it exists,
// so adding one to the firmware's generator is all it takes. Widgets whose
// content belongs to the user -- text and image -- have no shots on purpose and
// keep their live previews, because a screenshot of either would be a picture
// of somebody else's content.

import index from "./widget-shots/index.json";
import indexV1 from "./widget-shots/inkplate5v1/index.json";
import indexV2Portrait from "./widget-shots/inkplate5v2-portrait/index.json";
import indexV1Portrait from "./widget-shots/inkplate5v1-portrait/index.json";

const urls = import.meta.glob("./widget-shots/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

const urlsV1 = import.meta.glob("./widget-shots/inkplate5v1/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

const urlsV2Portrait = import.meta.glob("./widget-shots/inkplate5v2-portrait/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

const urlsV1Portrait = import.meta.glob("./widget-shots/inkplate5v1-portrait/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

// index.json carries the geometry, the glob carries the hashed URLs Vite
// emits. Joined on the filename, which is the one thing both agree on.
//
// A grid-sized widget carries a second rendition under "tall", which is the
// same widget on a page with no chip row: its cells are 200 rather than 166, so
// the card is taller and its content re-centred. Both are resolved here, and
// widgetShot() picks between them.
function resolve(entries, files, dir) {
  const shots = {};
  for (const [name, entry] of Object.entries(entries)) {
    const url = files[`${dir}${entry.file}`];
    if (!url) continue;
    const tallUrl = entry.tall && files[`${dir}${entry.tall.file}`];
    shots[name] = { ...entry, url, tall: tallUrl ? { ...entry.tall, url: tallUrl } : null };
  }

  // Names are "type", "type-size" or "type-size-icon", so the first one or two
  // segments are the useful prefixes. Sorted, so "whichever variant comes first"
  // is stable between builds rather than depending on directory order.
  const firstByPrefix = {};
  for (const name of Object.keys(shots).sort()) {
    const parts = name.split("-");
    for (const depth of [1, 2]) {
      const prefix = parts.slice(0, depth).join("-");
      if (!firstByPrefix[prefix]) firstByPrefix[prefix] = shots[name];
    }
  }
  return { shots, firstByPrefix };
}

// One set per panel. A widget on the Inkplate 5 is not the V2's picture at a
// different scale: its cell is 215x202 against 220x166, and a card is laid out
// for the box it is given rather than shrunk into it. Drawing the V2's renders
// on a V1 canvas put every card 26px over its own footprint and up to 56px
// short of it -- reported from the editor as "the widgets are the wrong size",
// which is exactly what they were.
// One set per *shape*: each panel, each way up. The cell is the same 210x172
// everywhere, but a card is not the same picture on a grid three columns wide as
// on one five wide, and the sizes on offer differ too.
const SETS = {
  "inkplate5v2:0": resolve(index, urls, "./widget-shots/"),
  "inkplate5v2:90": resolve(indexV2Portrait, urlsV2Portrait, "./widget-shots/inkplate5v2-portrait/"),
  "inkplate5v1:0": resolve(indexV1, urlsV1, "./widget-shots/inkplate5v1/"),
  "inkplate5v1:90": resolve(indexV1Portrait, urlsV1Portrait, "./widget-shots/inkplate5v1-portrait/"),
};

// What a panel that has not said which it is gets. Every manifest published
// before there were two panels, or before a panel could be stood on its side,
// meant this one.
const DEFAULT_SHAPE = "inkplate5v2:0";

// 180 is the same shape as 0 and 270 the same as 90 -- the panel is turned over
// within its own shape, and a card is drawn identically either way.
function shapeKey(model, orientation) {
  const portrait = orientation === 90 || orientation === 270;
  return `${model || "inkplate5v2"}:${portrait ? 90 : 0}`;
}

function setFor(model, orientation) {
  return SETS[shapeKey(model, orientation)] || SETS[DEFAULT_SHAPE];
}

const { shots, firstByPrefix } = SETS[DEFAULT_SHAPE];

// Most specific first. Two things can key a shot, for two different reasons.
//
// The icon keys a climate widget, which is mostly its room icon: one screenshot
// of a bedroom would be wrong for the other nine rooms, and worse than the CSS
// preview it replaced, which at least printed the room's name.
//
// The domain keys an entity widget. Until v0.1.18 the icon did, because the
// icon was typed in and was the only thing telling two cards apart. Now the
// card draws each domain differently -- a light shows a brightness, a door
// shows Open -- and picks its own icon from the domain, the device class and
// the state. So the domain is both what decides the appearance and what can be
// read straight off the chosen entity id.
//
// The prefix fallbacks at the end matter more than they look: a widget just
// dragged in has none of its options set yet, so an exact "climate-1x1-<icon>"
// cannot match. Without them a new climate widget would draw the CSS preview
// and then visibly switch to a render the moment a room was picked.
// tall asks for the rendition drawn on a page with no chip row. It falls back
// to the short one when a widget has no tall rendition -- the chips, and any
// shot set generated before the setting existed -- rather than drawing nothing.
export function widgetShot(type, sizeId, options = {}, tall = false, model = null,
                           orientation = 0) {
  const { shots, firstByPrefix } = setFor(model, orientation);
  const icon = options.icon;
  const entity = options.entity;
  const domain =
    typeof entity === "string" && entity.includes(".") ? entity.split(".")[0] : null;
  const candidates = [
    icon && sizeId && `${type}-${sizeId}-${icon}`,
    domain && sizeId && `${type}-${sizeId}-${domain}`,
    sizeId && `${type}-${sizeId}`,
    // Sizeless, which is what the chips are: a chip measures itself rather than
    // taking a footprint from the grid, so it has no size to key on. Without
    // this an entity chip on the canvas fell through to whichever domain sorted
    // first, putting a thermometer where a door belonged.
    domain && `${type}-${domain}`,
    icon && `${type}-${icon}`,
    type,
  ];
  const rendition = (shot) => (tall && shot?.tall) || shot || null;

  for (const name of candidates) {
    if (name && shots[name]) return rendition(shots[name]);
  }
  return rendition(
    (sizeId && firstByPrefix[`${type}-${sizeId}`]) || firstByPrefix[type] || null
  );
}

// One representative shot per type, for the palette.
export function paletteShot(type) {
  return shots[type] || firstByPrefix[type] || null;
}
