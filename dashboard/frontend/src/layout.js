// Layout helpers. Positions are pixels on the 1280x720 panel; snapping is
// purely an editor concern, which is what makes a precise mode possible.

import { optionValues } from "./format.js";

// Grid mode snaps to cell origins, so a widget lands exactly where the firmware
// would put it. The firmware publishes the grid in its manifest, so this is only
// the fallback for before it has been heard from.
export const FALLBACK_GRID = {
  gap: 37,
  gap_x: 37,
  gap_y: 30,
  margin_x: 41,
  margin_y: 29,
  unit_w: 210,
  unit_h: 172,
  unit_h_off: 172,
  cols: 5,
  rows: 3,
  chip_h: 56,
};

// The two axes do not share a gap, and the margin at the panel's edge is not
// the gap either. One cell -- 210x172 -- is used on both panels and both ways
// up, and no cell that size divides 1280, 720, 960 and 540 exactly, so each
// shape keeps its own gap and the leftover lives in the margin.
//
// Firmware older than that published one `gap` and no margins, and on it the
// margin *was* the gap; falling back that way describes those panels exactly
// rather than approximately.
export function gapX(grid) {
  return grid.gap_x ?? grid.gap;
}

export function gapY(grid) {
  return grid.gap_y ?? grid.gap;
}

export function marginX(grid) {
  return grid.margin_x ?? gapX(grid);
}

export function marginY(grid) {
  return grid.margin_y ?? gapY(grid);
}

// --- the two shapes a page is laid out in ------------------------------------
//
// A panel can stand up or lie on its side, and the two are different grids: a
// V2 is 5x3 one way and 3x6 the other. A page therefore keeps an arrangement
// for each -- `widgets` for standing up, `widgets_portrait` for on its side --
// and the editor works on one at a time.
//
// They are independent on purpose. Before this there was one arrangement, so
// turning the panel re-flowed it and saving afterwards wrote the re-flow back
// over the arrangement it came from, losing the original.

export const LANDSCAPE = "landscape";
export const PORTRAIT = "portrait";

export function shapeFromOrientation(orientation) {
  return orientation === 90 || orientation === 270 ? PORTRAIT : LANDSCAPE;
}

// Where a shape's arrangement lives on a page. `widgets` keeps its name because
// every layout ever written uses it and every one of those is a standing-up
// arrangement.
export function widgetsKey(shape) {
  return shape === PORTRAIT ? "widgets_portrait" : "widgets";
}

// The grid of a shape, from the manifest's `shapes` block. Firmware too old to
// publish both knows only the shape it is standing in, so that is what it gets
// -- the editor then draws one shape, which is what it always did.
//
// Completed from its *own* numbers before anything else fills it in. Every caller
// spreads this over FALLBACK_GRID, which is the V2 lying down, so a grid that
// published one `gap` and no margins -- any firmware before the shared cell --
// had the V2's 41px margin and 37/30 gaps quietly put under it. On a V1 that is
// where chips were rescued to: x 41 and a row at y 455, neither of them on the
// V1's own grid. The panel's size comes along too, because cardBandTop reads it
// for a page with no chip row and got NaN from a grid without one.
export function shapeGrid(manifest, shape) {
  const grid = manifest?.shapes?.[shape] || manifest?.grid;
  if (!grid) return FALLBACK_GRID;
  const gapXOwn = grid.gap_x ?? grid.gap;
  const gapYOwn = grid.gap_y ?? gapXOwn;
  const box = shapePanel(manifest, shape);
  return {
    ...grid,
    ...(gapXOwn != null ? { gap_x: gapXOwn, margin_x: grid.margin_x ?? gapXOwn } : {}),
    ...(gapYOwn != null ? { gap_y: gapYOwn, margin_y: grid.margin_y ?? gapYOwn } : {}),
    width: grid.width ?? box.width,
    height: grid.height ?? box.height,
  };
}

export function shapePanel(manifest, shape) {
  const known = manifest?.shapes?.[shape];
  if (known?.width && known?.height) return { width: known.width, height: known.height };
  return manifest?.display || { width: FALLBACK_GRID.width || 1280, height: 720 };
}

// Whether the panel can be edited in both shapes at all.
export function hasBothShapes(manifest) {
  return Boolean(manifest?.shapes?.landscape && manifest?.shapes?.portrait);
}

// What the panel draws for a shape a page has no arrangement for: the other
// shape's, bent onto this grid. The same rule as LayoutFit.h -- a card keeps the
// cell it was on and is dropped if that cell does not exist here; a chip keeps
// its place across the band between the margins.
//
// Mirrored here so the editor can *show* what the panel will draw before anyone
// has laid the page out sideways, rather than showing an empty page or a
// arrangement at the wrong scale.
export function fitToShape(widgets, from, to, chipRow, sizeOf) {
  const out = [];
  for (const widget of widgets || []) {
    const size = sizeOf ? sizeOf(widget) : null;
    const isChip = size?.isChip;

    if (isChip) {
      // Across the band between the margins, so a chip on one margin lands on
      // the other's rather than a few pixels inside it.
      const fromBand = from.width - 2 * marginX(from);
      const band = to.width - 2 * marginX(to);
      const x = fromBand > 0
        ? marginX(to) + Math.round(((widget.x - marginX(from)) * band) / fromBand)
        : widget.x;
      out.push({ ...widget, x: clamp(x, marginX(to), to.width - marginX(to)) });
      continue;
    }

    const col = Math.round((widget.x - marginX(from)) / (from.unit_w + gapX(from)));
    const row = Math.round((widget.y - cardBandTop(from, chipRow)) / (from.unit_h + gapY(from)));
    const cols = size?.cols || 1;
    const rows = size?.rows || 1;
    if (col < 0 || row < 0 || col + cols > to.cols || row + rows > to.rows) {
      continue; // no such cell on this shape
    }
    out.push({
      ...widget,
      x: marginX(to) + col * (to.unit_w + gapX(to)),
      y: cardBandTop(to, chipRow) + row * (to.unit_h + gapY(to)),
    });
  }
  return out;
}

// A page carries a chip row at the top or the bottom, or none at all. This is a
// *per page* choice: a full-screen clock page wants no row while a dashboard
// page wants one. It belongs to the layout rather than to the device -- the
// firmware draws widgets at the pixels it is given and never derives a row.
export const CHIP_ROW_POSITIONS = [
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
  { id: "off", label: "Off" },
];

export const DEFAULT_CHIP_ROW = "bottom";

// Which panel a manifest describes, for the things that differ between them.
//
// The screenshots are one: a widget on the Inkplate 5 is not the V2's picture
// scaled down -- its cell is 215x202 against 220x166 and the card is drawn for
// the box it is in -- so each panel has a set of its own and this picks between
// them. A manifest too old to say falls back to the V2, which is what every
// manifest meant before there was a second panel.
export function panelModel(manifest) {
  return manifest?.device?.model || manifest?.display?.model || null;
}

// Which way up the panel is standing, as the person looking at it would say.
// The width and height in the manifest are already the turned ones, so this is
// only needed to pick the right set of renders.
export function panelOrientation(manifest) {
  return Number(manifest?.display?.orientation ?? 0) || 0;
}

// Which way up a *shape* is, for anything that picks renders by orientation.
//
// Not the same question as panelOrientation, and using that one where this is
// meant is what made the editor draw the sideways arrangement out of the
// landscape set of renders: you can edit either arrangement whichever way the
// panel happens to be standing, so the shape on the screen and the shape on the
// wall come apart. Only portrait-or-not is ever read downstream, so one
// representative of each is enough -- a panel turned 270 picks the same renders
// as one turned 90, which is right, because it is the same shape.
export function shapeOrientation(shape) {
  return shape === PORTRAIT ? 90 : 0;
}

// The arrangement a shape shows for a page: its own if it has one, otherwise the
// other shape's bent onto this grid, which is what the panel would draw.
//
// Shared so that everything picturing a page agrees about which of the two it is
// picturing. The canvas did this itself and the Pages tab did not, so a page
// being edited sideways had a portrait-shaped thumbnail with the *upright*
// arrangement in it -- landscape pixel positions against a 720-wide box, which
// put cards off the edge of the thumbnail and read as the two orientations being
// swapped.
export function arrangementFor(page, shape, manifest, sizeOf) {
  const own = page?.[widgetsKey(shape)];
  if (own) return own;
  if (shape !== PORTRAIT) return page?.widgets || [];
  return fitToShape(
    page?.widgets || [],
    { ...FALLBACK_GRID, ...shapeGrid(manifest, LANDSCAPE) },
    { ...FALLBACK_GRID, ...shapeGrid(manifest, PORTRAIT) },
    page?.chip_row || DEFAULT_CHIP_ROW,
    sizeOf || sizeOfFrom(manifest)
  );
}

// What fitToShape needs to know about a widget: whether it is a chip, and how
// many cells it takes. Declared here so the canvas and the thumbnails cannot
// drift into bending a page two different ways.
export function sizeOfFrom(manifest) {
  return (widget) => {
    const type = widgetType(manifest, widget);
    const variant = (type?.sizes || []).find((one) => one.id === widget.size);
    return { isChip: isChipType(type), cols: variant?.cols, rows: variant?.rows };
  };
}

export function hasChipRow(chipRow) {
  return chipRow !== "off";
}

// The grid a page lays out on. With no chip row the 72px row and one 30px gap
// come free, and the three card rows take them: a cell is 200 tall rather than
// 166. Both heights come from the manifest, because the setting is per page and
// one layout can hold pages of each kind.
//
// The height rides on the grid object rather than being passed alongside it, so
// everything below -- the pitch, the origins, the snapping, the clamping --
// keeps working on the page it was handed without learning a new argument.
export function pageGrid(grid, chipRow) {
  if (hasChipRow(chipRow)) return grid;
  return { ...grid, unit_h: grid.unit_h_off || grid.unit_h };
}

// Where the chip row sits. Meaningless with the row off, where nothing should
// be asking: a page with no row has no chips on it.
export function chipRowTop(grid, panel, chipRow) {
  return chipRow === "top"
    ? marginY(grid)
    : panel.height - marginY(grid) - grid.chip_h;
}

// Where the card rows start. Only a row at the top moves them: with it at the
// bottom, or with no row at all, the cards start at the edge gap. What changes
// in the third case is how tall they then are, which is pageGrid's business.
export function cardBandTop(grid, chipRow) {
  if (chipRow === "off") {
    // The cards keep their size and take the middle of what the row gives
    // back, which is what the firmware does -- they no longer grow.
    const band = grid.rows * grid.unit_h + (grid.rows - 1) * gapY(grid);
    return Math.max(marginY(grid), Math.round((grid.height - band) / 2));
  }
  return chipRow === "top" ? marginY(grid) + grid.chip_h + gapY(grid) : marginY(grid);
}

// Where a widget's y lands when its page's chip row changes. Both the band top
// and the row pitch move -- turning the row off takes the pitch from 196 to 230
// -- so a widget is put back on the row it was on rather than shifted by a
// fixed amount, which would leave the bottom row 68px out.
//
// Whatever offset it had within its row is kept, so one deliberately nudged off
// the grid is not snapped flat onto it. Same rule store.py migrates a layout
// between grids with, for the same reason.
export function regridY(y, grid, from, to) {
  const fromGrid = pageGrid(grid, from);
  const toGrid = pageGrid(grid, to);
  const fromTop = cardBandTop(fromGrid, from);
  const fromPitch = gridPitch(fromGrid, "y");
  const row = Math.max(0, Math.round((y - fromTop) / fromPitch));
  const offset = y - (fromTop + row * fromPitch);
  return Math.max(0, cardBandTop(toGrid, to) + row * gridPitch(toGrid, "y") + offset);
}

export const SNAP_MODES = [
  { id: "grid", label: "Grid", hint: "cells" },
  { id: "fine", label: "Fine", hint: "20px", step: 20 },
  { id: "free", label: "Free", hint: "1px", step: 1 },
];

export const DEFAULT_SNAP = "grid";

export function gridPitch(grid, axis) {
  return axis === "x" ? grid.unit_w + gapX(grid) : grid.unit_h + gapY(grid);
}

// Where the run of cells starts on this axis. Horizontally that is always the
// edge gap; vertically it is wherever the chip row leaves the card band.
export function axisOrigin(grid, axis, chipRow) {
  return axis === "x" ? marginX(grid) : cardBandTop(grid, chipRow);
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
  const min = marginX(grid);
  const max = Math.max(min, panel.width - marginX(grid) - width);
  const intoRow = (value) => clamp(Math.round(value), min, max);

  // The span of left edges at which this chip would collide with that one
  const blocked = others
    .map((other) => ({
      from: other.x - gapX(grid) - width,
      to: other.x + other.width + gapX(grid),
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

// Puts every chip of one arrangement where the editor would have put it: on
// the row's y, and clear of the chips beside it. Returns the arrangement and
// whether anything moved.
//
// Two ways a layout comes to need this. A chip's y is written when it is placed
// and nothing touched it afterwards, so a layout from before the row shrank to
// 56 has every chip 17px above it -- drawn over the gap, with the band it snaps
// to sitting empty underneath. And rescuing stranded widgets sent every chip to
// the same corner, so a page could hold three chips on one pixel. The panel
// re-flows its own row, so neither was ever visible there; both were in the
// editor, which is where the chips are dragged from.
//
// In the order the chips already run, so settling never reorders a row. Packed
// rather than placed one at a time with placeChipX: that rule is for one chip
// being dragged among others that stay put, and it looks for the nearest free
// spot anywhere -- so a chip with no room left by the right margin was thrown to
// the far end of the row, ahead of the chips that had been before it. Here each
// chip keeps its x unless that would crowd the one before it, and a run pushed
// against the right margin then backs up leftwards to keep its gaps.
export function settleChips(arrangement, sizeOf, grid, panel, chipRow) {
  if (!hasChipRow(chipRow)) return { widgets: arrangement, changed: false };
  const y = chipRowTop(grid, panel, chipRow);
  const gap = gapX(grid);
  const min = marginX(grid);
  const chips = arrangement
    .map((widget, index) => ({ widget, index, width: sizeOf(widget)?.width || 0,
                               isChip: sizeOf(widget)?.isChip }))
    .filter((entry) => entry.isChip)
    .sort((a, b) => a.widget.x - b.widget.x || a.index - b.index);
  if (chips.length === 0) return { widgets: arrangement, changed: false };

  const maxFor = (entry) => Math.max(min, panel.width - marginX(grid) - entry.width);
  const xs = chips.map((entry) => clamp(Math.round(entry.widget.x), min, maxFor(entry)));
  // Rightwards: never closer than a gap to the chip before
  for (let i = 1; i < xs.length; i += 1) {
    xs[i] = Math.max(xs[i], xs[i - 1] + chips[i - 1].width + gap);
  }
  // Leftwards: never past the right margin, and never closer than a gap to the
  // chip after. A row too full for both ends overlaps at the left margin rather
  // than running off the panel, which is the one it cannot recover from.
  for (let i = xs.length - 1; i >= 0; i -= 1) {
    xs[i] = Math.min(xs[i], maxFor(chips[i]));
    if (i < xs.length - 1) xs[i] = Math.min(xs[i], xs[i + 1] - gap - chips[i].width);
    xs[i] = Math.max(xs[i], min);
  }

  const moved = new Map();
  chips.forEach((entry, i) => {
    if (xs[i] !== entry.widget.x || y !== entry.widget.y) {
      moved.set(entry.index, { ...entry.widget, x: xs[i], y });
    }
  });
  if (moved.size === 0) return { widgets: arrangement, changed: false };
  return {
    widgets: arrangement.map((widget, index) => moved.get(index) || widget),
    changed: true,
  };
}

// The chips a given widget has to keep clear of: every other one on the page.
export function otherChips(widgets, manifest, uploads, excludeId, grid = null) {
  return (widgets || [])
    .filter((widget) => widget.id !== excludeId && isChipType(widgetType(manifest, widget)))
    .map((widget) => ({
      x: widget.x,
      width: widgetSize(manifest, widget, uploads, DEFAULT_CHIP_ROW, grid).width,
    }));
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
    return { x: marginX(grid), y: chipRowTop(grid, panel, chipRow) };
  }
  return { x: marginX(grid), y: cardBandTop(grid, chipRow) };
}

// Whether a manifest type lives in the chip row
export function isChipType(type) {
  return Boolean(type?.chip);
}

// The sizes worth offering on this grid. The firmware publishes every size that
// fits either of the panel's shapes -- a 3x6 photo is only any use on its side,
// and a panel standing up would otherwise never publish it -- so the list is
// trimmed here to the shape being edited. A self-sizing variant (0 cells) is
// kept: it has no footprint to not fit. With no grid, or a grid that does not
// say how many cells it has, the list stands as published.
export function sizesOn(type, grid) {
  const sizes = type?.sizes || [];
  if (!grid?.cols || !grid?.rows) return sizes;
  return sizes.filter(
    (size) => !(size.cols > 0 && size.rows > 0) || (size.cols <= grid.cols && size.rows <= grid.rows)
  );
}

// A widget's drawn size comes from the manifest, since the firmware owns it.
// Some types size themselves from an option instead -- an image widget is as
// big as the picture chosen -- which the manifest flags with size_from.
// The size the chosen variant draws at, or null if the type has no variants
export function widgetVariant(type, widget) {
  if (!type?.sizes?.length) return null;
  return type.sizes.find((size) => size.id === widget.size) || type.sizes[0];
}

// What a variant draws at on a page with this chip row. A card is 34px taller
// per row on a page with none, which the manifest publishes per variant as
// height_off; an older manifest carries only the one height and falls back to
// it. Null for a self-sizing variant -- a width or height of 0 means the
// firmware measures its own content, and there is no footprint to compare.
// A size's box in pixels.
//
// The manifest publishes one per size, but those are worked out against the
// shape the panel is standing in *now* -- and a page is edited in both shapes,
// including the one the panel is not in. So when a grid is given, the box is
// derived from the size's cells against that grid, which is the same arithmetic
// Grid.h does. Without one, the published numbers stand, which is what every
// caller did before there were two shapes to choose between.
export function variantFootprint(variant, chipRow = DEFAULT_CHIP_ROW, grid = null) {
  if (grid && variant?.cols && variant?.rows) {
    const [width, height] = boxOn(grid, variant.cols, variant.rows, chipRow);
    return { width, height };
  }
  if (!variant?.width || !variant?.height) return null;
  return {
    width: variant.width,
    height: hasChipRow(chipRow) ? variant.height : variant.height_off || variant.height,
  };
}

// cols x rows of a grid, gaps included: gridWidth()/gridHeight() in Grid.h.
export function boxOn(grid, cols, rows, chipRow = DEFAULT_CHIP_ROW) {
  const unitH = hasChipRow(chipRow) ? grid.unit_h : grid.unit_h_off || grid.unit_h;
  return [
    cols * grid.unit_w + (cols - 1) * gapX(grid),
    rows * unitH + (rows - 1) * gapY(grid),
  ];
}

// The variant closest to a box dragged out on the canvas. Nearest by area
// difference rather than by corner distance: dragging the handle down past a
// 2x1 is meant to reach the 2x2, and a corner metric weighs the 100px the
// pointer overshot horizontally the same as the 200px of height that is the
// whole point of the gesture.
//
// Self-sizing variants are skipped -- they have no footprint to be near.
export function nearestVariant(type, box, chipRow = DEFAULT_CHIP_ROW, grid = null) {
  let best = null;
  let bestCost = Infinity;

  for (const variant of sizesOn(type, grid)) {
    const footprint = variantFootprint(variant, chipRow, grid);
    if (!footprint) continue;
    const cost =
      Math.abs(footprint.width - box.width) * footprint.height +
      Math.abs(footprint.height - box.height) * footprint.width;
    if (cost < bestCost) {
      bestCost = cost;
      best = variant;
    }
  }

  return best;
}

// Draw order is array order -- the firmware builds a page's widgets in the
// order the layout lists them and draws them in that order, so the last one
// wins where two overlap. Moving a widget through the array is therefore the
// whole of z-order, on both the panel and the canvas.
export const LAYER_MOVES = [
  { id: "back", label: "Back", title: "Send to back" },
  { id: "backward", label: "−", title: "Send backward" },
  { id: "forward", label: "+", title: "Bring forward" },
  { id: "front", label: "Front", title: "Bring to front" },
];

export function reorder(widgets, id, move) {
  const from = widgets.findIndex((widget) => widget.id === id);
  if (from < 0) return widgets;

  const last = widgets.length - 1;
  const to = clamp(
    { back: 0, backward: from - 1, forward: from + 1, front: last }[move] ?? from,
    0,
    last
  );
  if (to === from) return widgets;

  const next = [...widgets];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
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

// chipRow is the *page's* setting, because a card is 34px taller per row on a
// page with no chip row. The manifest publishes both heights rather than the
// editor deriving the second one, so the firmware stays the one place a
// widget's footprint is decided; an older manifest carries only the first, and
// falls back to it.
export function widgetSize(manifest, widget, uploads, chipRow = DEFAULT_CHIP_ROW, grid = null) {
  const type = manifest?.widgets?.find((candidate) => candidate.type === widget.type);
  if (!type) return { width: 160, height: 120 };

  const variant = widgetVariant(type, widget);
  if (variant) {
    // A variant of 0 means the widget measures its own content, which only the
    // firmware can do properly. Estimate from the text so there is something of
    // roughly the right shape to drag around.
    return variantFootprint(variant, chipRow, grid) || estimateTextSize(widget);
  }

  // A chip is as tall as the row it sits in, and that is a property of the
  // shape: 56 upright and 70 on its side on a V2. The published height is the
  // row of whichever shape the panel was standing in when it sent the manifest,
  // so taking it for both drew a 56px chip into a 70px row.
  if (type.chip && grid?.chip_h) {
    return { width: type.width || 160, height: grid.chip_h };
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
    const value = optionValues(manifest, option).find((candidate) => candidate.name === chosen);
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
