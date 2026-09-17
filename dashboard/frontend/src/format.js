// Durations, written the way the design writes them.
//
// Shared because the same cycle time appears in three places -- the pages
// column, the Pages screen's cycle card, and the rotation hint -- and they have
// to agree, or the reader is left working out which one is lying.

export function formatDuration(seconds) {
  if (!seconds) return "0 s";
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} m`;
}

// The cycle card writes its total as a clock -- 1:15, not "1 min 15 s". It is
// the one number on the screen big enough to read at a glance, and a clock is
// the shape the eye already knows for "how long this takes".
export function formatClock(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  if (minutes < 60) return `${minutes}:${rest}`;
  const hours = Math.floor(minutes / 60);
  return `${hours}:${String(minutes % 60).padStart(2, "0")}:${rest}`;
}

// The short form, for a badge on a page row
export function formatDwell(seconds) {
  if (!seconds) return "default";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

// How long a page actually stays up: its own dwell, or the default when it has
// none. 0 meaning "use the default" is the layout's convention, not a bug.
export function effectiveDwell(page, rotation) {
  return page.dwell_seconds || rotation?.default_dwell_seconds || 60;
}

export function chipRowLabel(chipRow) {
  if (chipRow === "off" || !chipRow) return "chips off";
  return `chips ${chipRow}`;
}

// Which accent a widget category wears, in the palette and on the inspector's
// head. The firmware owns the category list and publishes it, so this is a
// lookup with a fallback rather than a fixed set -- a category added in a later
// firmware gets the neutral tone instead of no tone at all.
const CATEGORY_TONES = {
  home: "yellow",
  panel: "blue",
  chip: "teal",
  device: "violet",
};

export function categoryTone(category) {
  return CATEGORY_TONES[category] || "violet";
}

// The label the manifest gave the category, for the inspector's eyebrow
export function categoryLabel(manifest, category) {
  return (manifest?.categories || []).find((one) => one.id === category)?.label || category || "";
}

// What an option's dropdown may offer.
//
// Two ways for the manifest to say it, and this is the only place that knows
// the difference. An option may carry its list inline as `values`, or name a
// shared one with `values_ref` that the manifest publishes once under a
// top-level `values` map.
//
// Sharing exists because the manifest goes out in a single MQTT publish and had
// grown to 17,067 bytes, of which about 2,400 were lists sent more than once:
// the same 71-name icon list on both entity widgets, the room icons on two
// more, and the update-interval choices on every one of the nineteen types. A
// publish that large is not merely wasteful -- on the panel it was failing
// outright and taking the broker session down with it.
//
// Inline still works and always will. An older firmware sends no `values` map
// at all, and a newer one is free to inline a list only one option uses; both
// arrive here and are answered the same way. That is what lets the add-on ship
// before the firmware that starts referencing.
export function optionValues(manifest, option) {
  if (!option) return [];
  if (Array.isArray(option.values)) return option.values;
  if (option.values_ref) return manifest?.values?.[option.values_ref] || [];
  return [];
}
