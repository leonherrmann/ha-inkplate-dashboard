// Layout helpers. Positions are pixels on the 1280x720 panel; snapping is
// purely an editor concern, which is what makes a precise mode possible.

// Grid mode snaps to cell origins, so a widget lands exactly where the firmware
// would put it. The firmware publishes the grid in its manifest, so this is only
// the fallback for before it has been heard from.
export const FALLBACK_GRID = { gap: 30, unit_w: 220, unit_h: 200, cols: 5, rows: 3 };

export const SNAP_MODES = [
  { id: "grid", label: "Grid", hint: "cells" },
  { id: "fine", label: "Fine", hint: "20px", step: 20 },
  { id: "free", label: "Free", hint: "1px", step: 1 },
];

export const DEFAULT_SNAP = "grid";

export function gridPitch(grid, axis) {
  return axis === "x" ? grid.unit_w + grid.gap : grid.unit_h + grid.gap;
}

export function gridOrigin(grid, axis, index) {
  return grid.gap + index * gridPitch(grid, axis);
}

// Nearest legal position on the chosen snap mode
export function snapValue(value, axis, mode, grid) {
  if (mode === "grid") {
    const pitch = gridPitch(grid, axis);
    return grid.gap + Math.round((value - grid.gap) / pitch) * pitch;
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

// Where a widget ends up after a drag: raw pixel delta, snapped, then kept on
// the panel so nothing can be dragged out of sight. In grid mode the clamp is
// also snapped, so being pushed back from an edge still lands on a cell.
export function placeWidget(widget, delta, mode, grid, size, panel) {
  const place = (value, axis, extent, span) => {
    const snapped = snapValue(value, axis, mode, grid);
    const limit = Math.max(0, extent - span);
    return mode === "grid"
      ? clamp(snapped, grid.gap, snapValue(limit, axis, mode, grid))
      : clamp(snapped, 0, limit);
  };

  return {
    x: place(widget.x + delta.x, "x", panel.width, size.width),
    y: place(widget.y + delta.y, "y", panel.height, size.height),
  };
}

// A widget's drawn size comes from the manifest, since the firmware owns it.
// Some types size themselves from an option instead -- an image widget is as
// big as the picture chosen -- which the manifest flags with size_from.
// The size the chosen variant draws at, or null if the type has no variants
export function widgetVariant(type, widget) {
  if (!type?.sizes?.length) return null;
  return type.sizes.find((size) => size.id === widget.size) || type.sizes[0];
}

export function widgetSize(manifest, widget, uploads) {
  const type = manifest?.widgets?.find((candidate) => candidate.type === widget.type);
  if (!type) return { width: 160, height: 120 };

  const variant = widgetVariant(type, widget);
  if (variant) {
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
