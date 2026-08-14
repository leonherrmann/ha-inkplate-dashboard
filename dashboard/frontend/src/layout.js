// Layout helpers. Positions are pixels on the 1280x720 panel; snapping is
// purely an editor concern, which is what makes a precise mode possible.

export const SNAP_STEPS = [
  { label: "Coarse", step: 80 },
  { label: "Fine", step: 20 },
  { label: "Free", step: 1 },
];

export const DEFAULT_SNAP = 20;

export function snap(value, step) {
  return Math.round(value / step) * step;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Where a widget ends up after a drag: raw pixel delta, snapped, then kept on
// the panel so nothing can be dragged out of sight.
export function placeWidget(widget, delta, step, size, panel) {
  return {
    x: clamp(snap(widget.x + delta.x, step), 0, Math.max(0, panel.width - size.width)),
    y: clamp(snap(widget.y + delta.y, step), 0, Math.max(0, panel.height - size.height)),
  };
}

// A widget's drawn size comes from the manifest, since the firmware owns it.
export function widgetSize(manifest, widget) {
  const type = manifest?.widgets?.find((candidate) => candidate.type === widget.type);
  return { width: type?.width || 160, height: type?.height || 120 };
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
