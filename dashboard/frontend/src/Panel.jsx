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
import { placeWidget, widgetSize } from "./layout.js";

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

function DraggableWidget({ widget, size, selected, onSelect, scale }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: widget.id,
  });

  // Pointer deltas are screen pixels; the panel is scaled, so convert back
  const offset = transform ? { x: transform.x / scale, y: transform.y / scale } : { x: 0, y: 0 };

  return (
    <div
      ref={setNodeRef}
      className={`widget${selected ? " selected" : ""}${isDragging ? " dragging" : ""}`}
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
      <WidgetPreview type={widget.type} options={widget.options} size={size} />
    </div>
  );
}

export default function Panel({
  panel,
  widgets,
  manifest,
  selectedId,
  onSelect,
  onMove,
  snapStep,
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

  const handleDragEnd = (event) => {
    const widget = widgets.find((candidate) => candidate.id === event.active.id);
    if (!widget) return;
    const delta = { x: event.delta.x / scale, y: event.delta.y / scale };
    onMove(widget.id, placeWidget(widget, delta, snapStep, widgetSize(manifest, widget), panel));
  };

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
              className="panel"
              style={{
                width: panel.width,
                height: panel.height,
                transform: `scale(${scale})`,
                backgroundSize: `${snapStep}px ${snapStep}px`,
              }}
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) onSelect(null);
              }}
            >
              {widgets.map((widget) => (
                <DraggableWidget
                  key={widget.id}
                  widget={widget}
                  size={widgetSize(manifest, widget)}
                  selected={widget.id === selectedId}
                  onSelect={onSelect}
                  scale={scale}
                />
              ))}
            </div>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
