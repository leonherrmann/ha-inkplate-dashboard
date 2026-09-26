import { useRef, useState } from "react";

import { Popover } from "./Popover.jsx";
import { CheckIcon, MonitorIcon } from "./Icons.jsx";

// Which panel is being edited.
//
// The editor shows one at a time and everything in it -- the canvas, the pages,
// the settings, the Device screen -- follows this one choice, so the control
// sits where the identity already was rather than being a fifth thing in the
// header. With one panel it reads as the label it replaced; the chevron and the
// list only mean anything when there is something to choose between.

export const MODEL_LABELS = {
  inkplate5v1: "Inkplate 5",
  inkplate5v2: "Inkplate 5 V2",
};

export function panelLabel(panel) {
  if (!panel) return "Panel";
  return panel.name || MODEL_LABELS[panel.model] || "Panel";
}

// Which panel the whole editor is about, from the top bar. Every screen below
// it -- the layout, the pages, the settings -- is this panel's alone.
//
// A menu that drops from the button rather than a dialog in the middle of the
// window: it is in the top-left corner, and a dialog made every choice a trip
// across the screen. It only chooses; naming and forgetting a panel are in
// Settings, under Panels. With one panel there is nothing to choose, and the
// name is simply a name.
export default function PanelPicker({ panels, selected, onSelect }) {
  const anchor = useRef(null);
  const [open, setOpen] = useState(false);

  const current = panels.find((panel) => panel.id === selected) || panels[0] || null;
  const several = panels.length > 1;

  const choose = (id) => {
    setOpen(false);
    if (id !== selected) onSelect(id);
  };

  const mark = (
    <span className="topbar-mark">
      <MonitorIcon size={14} />
    </span>
  );

  if (!several) {
    return (
      <span className="topbar-panel">
        {mark}
        <span className="topbar-name">{panelLabel(current)}</span>
      </span>
    );
  }

  return (
    <>
      <button
        ref={anchor}
        className="topbar-panel"
        onClick={() => setOpen((now) => !now)}
        title="Choose which panel to edit"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {mark}
        <span className="topbar-name">{panelLabel(current)}</span>
        <span className="device-chevron" aria-hidden="true" />
      </button>

      {open && (
        <Popover anchor={anchor} onClose={() => setOpen(false)} align="start" className="panel-menu" role="dialog" label="Panels">
          <div className="panel-list">
            {panels.map((panel) => (
              <button
                key={panel.id}
                className={panel.id === selected ? "panel-choose selected" : "panel-choose"}
                onClick={() => choose(panel.id)}
              >
                <span className={panel.online ? "dot online" : "dot offline"} />
                <span className="panel-text">
                  <span className="panel-name">{panelLabel(panel)}</span>
                  <span className="panel-spec">
                    {MODEL_LABELS[panel.model] || "Panel"}
                    {panel.online ? "" : " · offline"}
                    {!panel.has_manifest && " · not heard from yet"}
                  </span>
                </span>
                {panel.id === selected && <CheckIcon size={15} width={2.2} />}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}
