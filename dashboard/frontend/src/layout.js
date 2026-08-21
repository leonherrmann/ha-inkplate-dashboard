// Layout helpers. Positions are pixels on the 1280x720 panel; snapping is
// purely an editor concern, which is what makes a precise mode possible.

// Grid mode snaps to cell origins, so a widget lands exactly where the firmware
// would put it. The firmware publishes the grid in its manifest, so this is only
// the fallback for before it has been heard from.
export const FALLBACK_GRID = {
  gap: 30,
  unit_w: 220,
  unit_h: 166,
  cols: 5,
  rows: 3,
  chip_h: 72,
};

// The panel carries one chip row, at the top or the bottom. Which one shifts
// the card rows, so it belongs to the layout rather than to the device -- the
// firmware draws widgets at the pixels it is given and never derives a row.
export const CHIP_ROW_POSITIONS = [
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
];

export const DEFAULT_CHIP_ROW = "bottom";

export function chipRowTop(grid, panel, chipRow) {
  return chipRow === "top" ? grid.gap : panel.height - grid.gap - grid.chip_h;
}

// Where the card rows start. Only the chip row being at the top moves them.
export function cardBandTop(grid, chipRow) {
  return chipRow === "top" ? grid.gap + grid.chip_h + grid.gap : grid.gap;
}

export const SNAP_MODES = [
  { id: "grid", label: "Grid", hint: "cells" },
  { id: "fine", label: "Fine", hint: "20px", step: 20 },
  { id: "free", label: "Free", hint: "1px", step: 1 },
];

export const DEFAULT_SNAP = "grid";

export function gridPitch(grid, axis) {
  return axis === "x" ? grid.unit_w + grid.gap : grid.unit_h + grid.gap;
}

// Where the run of cells starts on this axis. Horizontally that is always the
// edge gap; vertically it is wherever the chip row leaves the card band.
export function axisOrigin(grid, axis, chipRow) {
  return axis === "x" ? grid.gap : cardBandTop(grid, chipRow);
}

export function gridOrigin(grid, axis, index, chipRow) {
  return axisOrigin(grid, axis, chipRow) + index * gridPitch(grid, axis);
}

// Nearest legal position on the chosen snap mode
export function snapValue(value, axis, mode, grid, chipRow) {
  if (mode === "grid") {
    const pitch = gridPitch(grid, axis);
    const origin = axisOrigin(grid, axis, chipRow);
    return origin + Math.round((value - origin) / pitch) * pitch;
  }
  const step = SNAP_MODES.find((entry) => entry.id === mode)?.step || 1;
  return Math.round(value / step) * step;
}

// "fit" shows the whole panel; the numbers are absolute scales that scroll when
// they exceed the viewport, which is how you place things precisely on a phone.
export const ZOOM_LEVELS = [
  { label: "Fit", value: "fit" },
  { label: "50%", value: 0.5 },
  { label: "100%", value: 1 },
];

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Largest cell origin that still leaves room for a widget of this span. Snapping
// the limit with snapValue() rounds to the *nearest* cell, which is frequently
// the one past the limit -- that is how a drag into a corner could put a widget
// beyond the panel edge, where the viewport clips it and nothing can reach it
// again. The upper bound has to round down, never up.
function lastCellThatFits(limit, axis, grid, chipRow) {
  const pitch = gridPitch(grid, axis);
  const start = axisOrigin(grid, axis, chipRow);
  const origin = start + Math.floor((limit - start) / pitch) * pitch;
  // A widget too big for even the first cell still starts at the origin; it
  // will overhang, but there is nowhere better to put it.
  return Math.max(start, origin);
}

// Where a chip lands horizontally. Free to the pixel, with two rules: it stays
// inside the panel's edge gap, and it keeps at least that same gap from any
// other chip. Without the second rule two chips could sit on the same pixel,
// which is what dragging one onto another used to do -- both ended up at the
// left edge, overlapping.
//
// Neighbours are measured with the manifest's nominal widths, which are the
// widest each chip gets, so the spacing the editor guarantees is never tighter
// than what the device draws.
export function placeChipX(desired, width, others, grid, panel) {
  const min = grid.gap;
  const max = Math.max(min, panel.width - grid.gap - width);
  const intoRow = (value) => clamp(Math.round(value), min, max);

  // The span of left edges at which this chip would collide with that one
  const blocked = others
    .map((other) => ({
      from: other.x - grid.gap - width,
      to: other.x + other.width + grid.gap,
    }))
    .sort((a, b) => a.from - b.from);

  const legal = (value) => !blocked.some((span) => value > span.from && value < span.to);

  const wanted = intoRow(desired);
  if (legal(wanted)) return wanted;

  // Otherwise the nearest spot hard against one side or the other of whatever
  // is in the way. Every span edge is a candidate, because sliding clear of one
  // neighbour can land inside the next.
  const candidates = blocked.flatMap((span) => [intoRow(span.from), intoRow(span.to)]);
  const usable = candidates.filter(legal);
  if (usable.length === 0) return wanted;

  return usable.reduce((best, value) =>
    Math.abs(value - wanted) < Math.abs(best - wanted) ? value : best
  );
}

// The chips a given widget has to keep clear of: every other one on the page.
export function otherChips(widgets, manifest, uploads, excludeId) {
  return (widgets || [])
    .filter((widget) => widget.id !== excludeId && isChipType(widgetType(manifest, widget)))
    .map((widget) => ({ x: widget.x, width: widgetSize(manifest, widget, uploads).width }));
}

// Where a widget ends up after a drag: raw pixel delta, snapped, then kept on
// the panel so nothing can be dragged out of sight. In grid mode the clamp is
// also snapped, so being pushed back from an edge still lands on a cell.
//
// A chip is different on both axes. Its y is pinned to the chip row, because
// that row is the whole reason it exists and there is no second place to put
// it. Its x is never snapped, whatever the mode says: chips size themselves to
// their content, so a column pitch would either truncate the long ones or pad
// the short ones out to nothing.
export function placeWidget(widget, delta, mode, grid, size, panel, options = {}) {
  const { chipRow = DEFAULT_CHIP_ROW, isChip = false, others = [] } = options;

  if (isChip) {
    return {
      x: placeChipX(widget.x + delta.x, size.width, others, grid, panel),
      y: chipRowTop(grid, panel, chipRow),
    };
  }

  const place = (value, axis, extent, span) => {
    const snapped = snapValue(value, axis, mode, grid, chipRow);
    const limit = Math.max(0, extent - span);
    return mode === "grid"
      ? clamp(snapped, axisOrigin(grid, axis, chipRow), lastCellThatFits(limit, axis, grid, chipRow))
      : clamp(snapped, 0, limit);
  };

  return {
    x: place(widget.x + delta.x, "x", panel.width, size.width),
    y: place(widget.y + delta.y, "y", panel.height, size.height),
  };
}

// Enough of a widget to be worth aiming a cursor at. Below this it is treated as
// stranded rather than merely overhanging.
const GRABBABLE = 24;

// Whether enough of the widget is on the panel to select and drag it. A widget
// fully outside is clipped away by .panel-viewport, so it cannot be selected,
// moved or deleted -- the editor offers no way of getting it back, which is why
// anything stranded has to be rescued rather than left for the user to fix.
//
// Widgets are allowed to overhang: an edge poking past the panel is the user's
// business and still draggable. Only the unreachable ones are rescued.
export function isReachable(widget, size, panel) {
  const visibleWidth = Math.min(widget.x + size.width, panel.width) - Math.max(widget.x, 0);
  const visibleHeight = Math.min(widget.y + size.height, panel.height) - Math.max(widget.y, 0);
  return (
    visibleWidth >= Math.min(GRABBABLE, size.width) &&
    visibleHeight >= Math.min(GRABBABLE, size.height)
  );
}

// Where a rescued widget lands, and where a new one starts: the first cell,
// grid-aligned and inside the edge gap rather than jammed into the corner. A
// chip starts in the chip row instead, since that is the only row it can sit in.
export function defaultPosition(grid, options = {}) {
  const { chipRow = DEFAULT_CHIP_ROW, isChip = false, panel } = options;
  if (isChip && panel) {
    return { x: grid.gap, y: chipRowTop(grid, panel, chipRow) };
  }
  return { x: grid.gap, y: cardBandTop(grid, chipRow) };
}

// Whether a manifest type lives in the chip row
export function isChipType(type) {
  return Boolean(type?.chip);
}

// A widget's drawn size comes from the manifest, since the firmware owns it.
// Some types size themselves from an option instead -- an image widget is as
// big as the picture chosen -- which the manifest flags with size_from.
// The size the chosen variant draws at, or null if the type has no variants
export function widgetVariant(type, widget) {
  if (!type?.sizes?.length) return null;
  return type.sizes.find((size) => size.id === widget.size) || type.sizes[0];
}

// Only used for auto-sized text, where the firmware measures the real thing and
// the editor cannot. Measured rather than counted: character counts are wildly
// wrong for anything proportional, and clipping a heading to its first word is
// worse than being a few percent out.
let measuringContext = null;

export function fontPixels(fontName) {
  const points = Number((fontName || "nunito_bold_24").match(/(\d+)$/)?.[1] || 24);
  return Math.round(points * 1.34);
}

function estimateTextSize(widget) {
  const text = widget.options?.text || "";
  const pixels = fontPixels(widget.options?.font);
  const weight = widget.options?.font?.includes("extrabold") ? 800 : 700;
  const lines = text.split("\n");

  let longest = 0;
  if (typeof document !== "undefined") {
    if (!measuringContext) measuringContext = document.createElement("canvas").getContext("2d");
    // Nunito is not loaded in the browser, so this is the editor's own family at
    // the same size -- close in proportion, not identical.
    measuringContext.font = `${weight} ${pixels}px ${getComputedStyle(document.body).fontFamily}`;
    for (const line of lines) {
      longest = Math.max(longest, measuringContext.measureText(line).width);
    }
  } else {
    longest = lines.reduce((most, line) => Math.max(most, line.length), 0) * pixels * 0.55;
  }

  return {
    width: Math.max(40, Math.round(longest)),
    height: Math.max(pixels, Math.round(lines.length * pixels * 1.35)),
  };
}

export function widgetSize(manifest, widget, uploads) {
  const type = manifest?.widgets?.find((candidate) => candidate.type === widget.type);
  if (!type) return { width: 160, height: 120 };

  const variant = widgetVariant(type, widget);
  if (variant) {
    // A variant of 0 means the widget measures its own content, which only the
    // firmware can do properly. Estimate from the text so there is something of
    // roughly the right shape to drag around.
    if (!variant.width || !variant.height) {
      return estimateTextSize(widget);
    }
    return { width: variant.width, height: variant.height };
  }

  if (type.size_from) {
    const option = type.options?.find((candidate) => candidate.key === type.size_from);
    const chosen = widget.options?.[type.size_from];
    // Uploaded images are not in the manifest -- the firmware only lists what is
    // compiled into it -- so look there first, then fall back to the built-ins.
    const uploaded = uploads?.find((candidate) => candidate.name === chosen);
    if (uploaded?.width) {
      return { width: uploaded.width, height: uploaded.height };
    }
    const value = option?.values?.find((candidate) => candidate.name === chosen);
    if (value?.width) {
      return { width: value.width, height: value.height };
    }
    // Nothing picked yet: a visible placeholder to drag around
    return { width: 240, height: 160 };
  }

  return { width: type.width || 160, height: type.height || 120 };
}

export function widgetType(manifest, widget) {
  return manifest?.widgets?.find((candidate) => candidate.type === widget.type);
}

export function newId() {
  // randomUUID needs a secure context; ingress is same-origin over https in
  // practice, but fall back so the editor still works on plain http.
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
  }
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
