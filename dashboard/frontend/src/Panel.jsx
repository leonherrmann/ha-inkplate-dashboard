import { useLayoutEffect, useRef, useState } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import WidgetPreview from "./WidgetPreview.jsx";
import {
  cardBandTop,
  chipRowTop,
  gridPitch,
  hasChipRow,
  isChipType,
  nearestVariant,
  otherChips,
  placeWidget,
  variantFootprint,
  widgetSize,
  widgetType,
  widgetVariant,
} from "./layout.js";

// The resize handle is a second draggable on the same widget, so the two are
// told apart by their id. Widget ids are hex, so nothing can collide with this.
const RESIZE = "resize:";

// The real cells, as rectangles with the gap between them, rather than rules
// drawn on the cell boundaries. The old backgroundSize trick could only ever
// draw lines at the pitch, so the 30px gap the device leaves around every cell
// was invisible and widgets looked like they should butt up against each other.
function GridCells({ grid, panel, chipRow }) {
  const cells = [];
  const bandTop = cardBandTop(grid, chipRow);

  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      cells.push(
        <div
          key={`${row}-${col}`}
          className="cell"
          style={{
            left: grid.gap + col * gridPitch(grid, "x"),
            top: bandTop + row * gridPitch(grid, "y"),
            width: grid.unit_w,
            height: grid.unit_h,
          }}
        />
      );
    }
  }

  return (
    <div className="cells-layer" aria-hidden="true">
      {cells}
      {/* One band, full width: chips size themselves, so there is nothing to
          divide it into. A page with the row off has no band at all -- its
          three cell rows have already taken that height. */}
      {hasChipRow(chipRow) && (
        <div
          className="cell chip-band"
          style={{
            left: grid.gap,
            top: chipRowTop(grid, panel, chipRow),
            width: panel.width - 2 * grid.gap,
            height: grid.chip_h,
          }}
        />
      )}
    </div>
  );
}

// Measured from a zero-height, full-width ruler. Measuring the panel's own
// container is what caused the mobile overflow: the fixed 1280px panel widened
// that container, so the measurement came back as 1280 and the scale never
// shrank. A ruler with no height cannot be inflated by anything.
function useAvailableWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const update = () => setWidth(element.getBoundingClientRect().width);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return [ref, width];
}

// A widget is resized by dragging its corner between the sizes the firmware
// offers -- there is no free resizing to be had, since a widget's footprint is
// the manifest's and the device would ignore anything else. So the drag picks
// the nearest variant and the ghost shows which one, rather than the box
// following the pointer to a size nothing can draw.
function ResizeHandle({ listeners, attributes, setNodeRef }) {
  // The widget itself is draggable, and this sits inside it: without stopping
  // the gesture here, taking hold of the corner would start a move as well as a
  // resize. Every listener is wrapped rather than onPointerDown alone, because
  // which one dnd-kit uses depends on the sensor -- mouse and touch differ.
  const guarded = Object.fromEntries(
    Object.entries(listeners || {}).map(([name, handler]) => [
      name,
      (event) => {
        event.stopPropagation();
        handler(event);
      },
    ])
  );

  return (
    <button
      ref={setNodeRef}
      className="resize-handle"
      aria-label="Resize"
      onClick={(event) => event.stopPropagation()}
      {...attributes}
      {...guarded}
    />
  );
}

function DraggableWidget({
  widget,
  size,
  type,
  chipRow,
  selected,
  onSelect,
  scale,
  uploads,
  tall,
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: widget.id,
  });

  // Only where there is more than one footprint to choose between: a chip and
  // an image have none to offer, an image being the size of the picture chosen.
  //
  // Self-sizing variants are filtered out rather than counted, so the text
  // widget's "auto" is not something a drag can land on -- it has no box to be
  // near. Its fixed sizes are draggable; the inspector is the way back to auto.
  const variants = (type?.sizes || []).filter((variant) => variantFootprint(variant, chipRow));
  const resizable = selected && variants.length > 1;
  const resize = useDraggable({ id: `${RESIZE}${widget.id}`, disabled: !resizable });

  // Pointer deltas are screen pixels; the panel is scaled, so convert back
  const offset = transform ? { x: transform.x / scale, y: transform.y / scale } : { x: 0, y: 0 };

  // What the corner is currently over, drawn as an outline while the drag is in
  // hand. Without it the gesture is blind: the widget cannot follow the pointer
  // (it can only be one of a handful of sizes) so nothing else would move.
  const pending = resize.transform
    ? nearestVariant(
        type,
        {
          width: size.width + resize.transform.x / scale,
          height: size.height + resize.transform.y / scale,
        },
        chipRow
      )
    : null;
  const ghost = pending ? variantFootprint(pending, chipRow) : null;

  return (
    <div
      ref={setNodeRef}
      className={`widget${selected ? " selected" : ""}${isDragging ? " dragging" : ""}${
        resize.isDragging ? " resizing" : ""
      }`}
      style={{
        left: widget.x,
        top: widget.y,
        width: size.width,
        height: size.height,
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
      }}
      onClick={() => onSelect(widget.id)}
      {...listeners}
      {...attributes}
    >
      <WidgetPreview
        type={widget.type}
        options={widget.options}
        size={size}
        uploads={uploads}
        sizeId={widget.size}
        tall={tall}
      />

      {/* Named as the inspector names it, plus the cells it covers: the labels
          are words like "Large", which say which of the sizes this is but not
          how big it is against the grid you are dragging over. */}
      {ghost && (
        <div className="resize-ghost" style={{ width: ghost.width, height: ghost.height }}>
          <span>
            {pending.label}
            {pending.cols > 0 && pending.rows > 0 ? ` ${pending.cols}×${pending.rows}` : ""}
          </span>
        </div>
      )}

      {resizable && (
        <ResizeHandle
          listeners={resize.listeners}
          attributes={resize.attributes}
          setNodeRef={resize.setNodeRef}
        />
      )}
    </div>
  );
}

export default function Panel({
  panel,
  widgets,
  manifest,
  uploads,
  selectedId,
  onSelect,
  onMove,
  onResize,
  snapMode,
  grid,
  chipRow,
  zoom,
}) {
  const [rulerRef, available] = useAvailableWidth();

  // Leave room for the offset shadow, which sits outside the scaler's box
  const SHADOW = 6;
  const fitScale =
    available > 0 ? Math.min(1, Math.max(0, available - SHADOW) / panel.width) : 1;
  const scale = zoom === "fit" ? fitScale : zoom;
  const fits = scale <= fitScale;

  // A drag only starts past a movement threshold, or after a short press on
  // touch. Below that the gesture stays a click, which is what makes
  // tap-to-select work, and lets a swipe scroll the page on a phone.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleResizeEnd = (widget, delta) => {
    const type = widgetType(manifest, widget);
    const size = widgetSize(manifest, widget, uploads, chipRow);
    const variant = nearestVariant(
      type,
      { width: size.width + delta.x, height: size.height + delta.y },
      chipRow
    );
    // A drag that lands back on the size it started from is not an edit. Saying
    // so here rather than in App keeps it off the undo stack as well.
    if (variant && variant.id !== widgetVariant(type, widget)?.id) {
      onResize(widget.id, variant.id);
    }
  };

  const handleDragEnd = (event) => {
    const active = String(event.active.id);
    const resizing = active.startsWith(RESIZE);
    const widget = widgets.find(
      (candidate) => candidate.id === (resizing ? active.slice(RESIZE.length) : active)
    );
    if (!widget) return;
    const delta = { x: event.delta.x / scale, y: event.delta.y / scale };

    if (resizing) {
      handleResizeEnd(widget, delta);
      return;
    }

    onMove(
      widget.id,
      placeWidget(widget, delta, snapMode, grid, widgetSize(manifest, widget, uploads, chipRow), panel, {
        chipRow,
        isChip: isChipType(widgetType(manifest, widget)),
        others: otherChips(widgets, manifest, uploads, widget.id),
      })
    );
  };

  // In grid mode the backdrop shows the actual cells, so it is obvious where a
  // widget will land; the finer modes just get a plain rule grid.
  const showCells = snapMode === "grid";
  const backdrop = showCells
    ? {}
    : { backgroundSize: `${snapMode === "fine" ? 20 : 10}px ${snapMode === "fine" ? 20 : 10}px` };

  return (
    <div className="panel-outer">
      <div className="ruler" ref={rulerRef} aria-hidden="true" />

      {/* Clipped when it fits so it can never spill; scrollable when zoomed in */}
      <div className={fits ? "panel-viewport" : "panel-viewport scrollable"}>
        <div
          className="panel-scaler"
          style={{
            width: Math.round(panel.width * scale),
            height: Math.round(panel.height * scale),
            visibility: available > 0 ? "visible" : "hidden",
          }}
        >
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div
              className={showCells ? "panel gridded" : "panel"}
              style={{
                width: panel.width,
                height: panel.height,
                transform: `scale(${scale})`,
                ...backdrop,
              }}
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) onSelect(null);
              }}
            >
              {showCells && <GridCells grid={grid} panel={panel} chipRow={chipRow} />}
              {widgets.map((widget) => (
                <DraggableWidget
                  key={widget.id}
                  widget={widget}
                  size={widgetSize(manifest, widget, uploads, chipRow)}
                  type={widgetType(manifest, widget)}
                  chipRow={chipRow}
                  selected={widget.id === selectedId}
                  onSelect={onSelect}
                  scale={scale}
                  uploads={uploads}
                  tall={!hasChipRow(chipRow)}
                />
              ))}
            </div>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
