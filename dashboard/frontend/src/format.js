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
