import { useEffect, useRef, useState } from "react";
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

// The panel is a fixed 1280x720 surface. Rather than lay it out responsively,
// it is drawn at full size and scaled to whatever width is available, so what
// you see is always proportionally the real thing.
function useScale(panelWidth) {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const available = entry.contentRect.width;
      setScale(Math.min(1, available / panelWidth));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [panelWidth]);

  return [ref, scale];
}

function DraggableWidget({ widget, size, selected, onSelect, scale }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: widget.id,
  });

  // Pointer deltas are in screen pixels; the panel is scaled, so convert back
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

export default function Panel({ panel, widgets, manifest, selectedId, onSelect, onMove, snapStep }) {
  const [wrapperRef, scale] = useScale(panel.width);

  // A drag only starts once the pointer has travelled far enough (or, on touch,
  // after a short press). Below that threshold the gesture stays a click, which
  // is what makes tap-to-select work without dragging first, and lets a swipe
  // scroll the page on a phone instead of dragging a widget.
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
    <div className="panel-wrapper" ref={wrapperRef}>
      <div
        className="panel-scaler"
        style={{ width: panel.width * scale, height: panel.height * scale }}
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
              // Clicking the bare panel clears the selection
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
  );
}
