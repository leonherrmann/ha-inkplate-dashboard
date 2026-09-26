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
import { BackIcon, DuplicateIcon, FrontIcon, TrashIcon } from "./Icons.jsx";
import {
  cardBandTop,
  chipRowTop,
  gridPitch,
  hasChipRow,
  isChipType,
  marginX,
  nearestVariant,
  otherChips,
  panelModel,
  shapeOrientation,
  placeWidget,
  sizesOn,
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
//
// Measured from the margin, which is where a card snaps and where the panel
// draws it. It used to be the gap, which was the same number until every shape
// took one shared cell; since then the cells and the chip band sat 4px left of
// every widget snapped into them on a V2 lying down, and 5px right of them on a
// V1, where the margin is the smaller of the two.
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
            left: marginX(grid) + col * gridPitch(grid, "x"),
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
            left: marginX(grid),
            top: chipRowTop(grid, panel, chipRow),
            width: panel.width - 2 * marginX(grid),
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
  model,
  orientation,
  grid,
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
  const variants = sizesOn(type, grid).filter((variant) => variantFootprint(variant, chipRow, grid));
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
        chipRow,
        grid
      )
    : null;
  const ghost = pending ? variantFootprint(pending, chipRow, grid) : null;

  return (
    <div
      ref={setNodeRef}
      className={`widget${isChipType(type) ? " chip-widget" : ""}${selected ? " selected" : ""}${isDragging ? " dragging" : ""}${
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
        model={model}
        orientation={orientation}
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

// Front, back, duplicate and delete, floating over the selected widget. They
// were four icons at the far end of the toolbar, dimmed whenever nothing was
// selected -- which is most of the time -- and a long way from the widget they
// acted on. Placed above the widget, or below it where the canvas runs out,
// and measured from the drawn widget so zoom and scroll need no arithmetic.
function SelectionBar({ outer, selectedId, actions, deps }) {
  const bar = useRef(null);
  const [place, setPlace] = useState(null);

  useLayoutEffect(() => {
    const measure = () => {
      const frame = outer.current;
      const widget = frame?.querySelector(".widget.selected");
      const own = bar.current;
      if (!frame || !widget || !own) return setPlace(null);
      const box = frame.getBoundingClientRect();
      const at = widget.getBoundingClientRect();
      const height = own.offsetHeight;
      const width = own.offsetWidth;
      const above = at.top - box.top - height - 10;
      const below = at.bottom - box.top + 10;
      const top =
        above >= 4 ? above : below + height <= box.height - 4 ? below : at.top - box.top + 8;
      const left = Math.min(
        Math.max(4, at.left - box.left + at.width / 2 - width / 2),
        box.width - width - 4
      );
      setPlace({ top, left });
    };
    measure();
    window.addEventListener("resize", measure);
    const viewport = outer.current?.querySelector(".panel-viewport");
    viewport?.addEventListener("scroll", measure);
    return () => {
      window.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
    };
    // Re-measured whenever the widget can have moved or changed size
  }, [selectedId, ...deps]);

  const { layer, layerCount, onFront, onBack, onDuplicate, onDelete, mod } = actions;
  return (
    <div
      ref={bar}
      className="selection-bar"
      role="toolbar"
      aria-label="Selected widget"
      style={place ? { top: place.top, left: place.left } : { visibility: "hidden" }}
      // A tap here is not a tap on the canvas behind it, which would deselect
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        className="icon-button plain"
        onClick={onFront}
        disabled={layer >= layerCount - 1}
        title="Bring to front"
        aria-label="Bring to front"
      >
        <FrontIcon size={15} />
      </button>
      <button
        className="icon-button plain"
        onClick={onBack}
        disabled={layer <= 0}
        title="Send to back"
        aria-label="Send to back"
      >
        <BackIcon size={15} />
      </button>
      <button
        className="icon-button plain"
        onClick={onDuplicate}
        title={`Duplicate (${mod}D)`}
        aria-label="Duplicate"
      >
        <DuplicateIcon size={15} />
      </button>
      <span className="selection-bar-rule" aria-hidden="true" />
      <button
        className="icon-button plain danger"
        onClick={onDelete}
        title="Delete this widget"
        aria-label="Delete widget"
      >
        <TrashIcon size={15} />
      </button>
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
  onDragState,
  shape,
  actions,
}) {
  const [rulerRef, available] = useAvailableWidth();
  const outer = useRef(null);
  const [dragging, setDragging] = useState(false);

  // Leave room for the offset shadow, which sits outside the scaler's box
  const SHADOW = 6;
  // Against the panel's *long* side, not its width. Fitting the width is the
  // same thing while a panel is only ever wider than it is tall, and stopped
  // being once one could be stood on its side: 720 fits in the width of any
  // screen this runs on, so the fit came out at 1:1 and a portrait canvas was
  // drawn at 720x1280 -- the whole window full of the top third of the page,
  // which reads as the shape being the wrong way round rather than as a canvas
  // needing scrolled.
  //
  // The long side also makes the two shapes the same scale as each other, which
  // is the truth of this grid: the cell is 210x172 whichever way the panel
  // stands, so a card is the same size on the screen in both. Landscape is
  // unchanged, being the side that was already measured.
  const fitScale =
    available > 0
      ? Math.min(1, Math.max(0, available - SHADOW) / Math.max(panel.width, panel.height))
      : 1;
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
    const size = widgetSize(manifest, widget, uploads, chipRow, grid);
    const variant = nearestVariant(
      type,
      { width: size.width + delta.x, height: size.height + delta.y },
      chipRow,
      grid
    );
    // A drag that lands back on the size it started from is not an edit. Saying
    // so here rather than in App keeps it off the undo stack as well.
    if (variant && variant.id !== widgetVariant(type, widget)?.id) {
      onResize(widget.id, variant.id);
    }
  };

  // The selection bar gets out of the way while a widget is being moved.
  // Reported from here rather than inferred, because dnd-kit is the only thing
  // that knows a press has become a drag -- below the sensors' threshold the
  // same gesture is still a tap.
  const handleDragStart = () => {
    setDragging(true);
    onDragState?.(true);
  };

  const handleDragEnd = (event) => {
    setDragging(false);
    onDragState?.(false);
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
      placeWidget(widget, delta, snapMode, grid, widgetSize(manifest, widget, uploads, chipRow, grid), panel, {
        chipRow,
        isChip: isChipType(widgetType(manifest, widget)),
        others: otherChips(widgets, manifest, uploads, widget.id, grid),
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
    <>
      <div className="panel-outer" ref={outer}>
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
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => {
                setDragging(false);
                onDragState?.(false);
              }}
            >
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
                    size={widgetSize(manifest, widget, uploads, chipRow, grid)}
                    grid={grid}
                    type={widgetType(manifest, widget)}
                    chipRow={chipRow}
                    selected={widget.id === selectedId}
                    onSelect={onSelect}
                    scale={scale}
                    uploads={uploads}
                    tall={!hasChipRow(chipRow)}
                    model={panelModel(manifest)}
                    orientation={shapeOrientation(shape)}
                  />
                ))}
              </div>
            </DndContext>
          </div>
        </div>

        {actions && selectedId && !dragging && widgets.some((one) => one.id === selectedId) && (
          <SelectionBar
            outer={outer}
            selectedId={selectedId}
            actions={actions}
            deps={[scale, available, widgets, zoom]}
          />
        )}
      </div>
    </>
  );
}
