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

const urls = import.meta.glob("./widget-shots/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

// index.json carries the geometry, the glob carries the hashed URLs Vite
// emits. Joined on the filename, which is the one thing both agree on.
const shots = {};
for (const [name, entry] of Object.entries(index)) {
  const url = urls[`./widget-shots/${entry.file}`];
  if (url) shots[name] = { ...entry, url };
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

// Most specific first. The icon is in the key because a climate widget is
// mostly its room icon, so one screenshot of a bedroom would be wrong for the
// other nine rooms -- worse than the CSS preview it replaced, which at least
// printed the room's name.
//
// The prefix fallbacks at the end matter more than they look: a widget just
// dragged in has none of its options set yet, so an exact "climate-1x1-<icon>"
// cannot match. Without them a new climate widget would draw the CSS preview
// and then visibly switch to a render the moment a room was picked.
export function widgetShot(type, sizeId, options = {}) {
  const icon = options.icon;
  const candidates = [
    icon && sizeId && `${type}-${sizeId}-${icon}`,
    sizeId && `${type}-${sizeId}`,
    icon && `${type}-${icon}`,
    type,
  ];
  for (const name of candidates) {
    if (name && shots[name]) return shots[name];
  }
  return (sizeId && firstByPrefix[`${type}-${sizeId}`]) || firstByPrefix[type] || null;
}

// One representative shot per type, for the palette.
export function paletteShot(type) {
  return shots[type] || firstByPrefix[type] || null;
}
