import { useRef, useState } from "react";

import { Popover } from "./Popover.jsx";
import { CheckIcon, MonitorIcon, PencilIcon } from "./Icons.jsx";

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
// window: it was opened from the top-left corner and made you cross the whole
// screen to choose, for a list that is usually two names long.
export default function PanelPicker({
  panels,
  selected,
  onSelect,
  onRename,
  onForget,
}) {
  const anchor = useRef(null);
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [draft, setDraft] = useState("");

  const current = panels.find((panel) => panel.id === selected) || panels[0] || null;
  // One panel is not a choice. The button still opens the list, because that is
  // where renaming lives, but it does not advertise a decision nobody has.
  const several = panels.length > 1;

  const close = () => {
    setOpen(false);
    setRenaming(null);
  };

  const choose = (id) => {
    close();
    if (id !== selected) onSelect(id);
  };

  const commitRename = async (event) => {
    event.preventDefault();
    const id = renaming;
    setRenaming(null);
    await onRename(id, draft);
  };

  // The name and a chevron, always. The list it opens is also where a panel
  // is renamed, so it is worth opening with only one panel.
  const trigger = (
    <button
      ref={anchor}
      className="topbar-panel"
      onClick={() => (open ? close() : setOpen(true))}
      title={several ? "Choose which panel to edit" : "Rename this panel"}
      aria-haspopup="menu"
      aria-expanded={open}
    >
      <span className="topbar-mark">
        <MonitorIcon size={14} />
      </span>
      <span className="topbar-name">{panelLabel(current)}</span>
      <span className="device-chevron" aria-hidden="true" />
    </button>
  );

  return (
    <>
      {trigger}

      {open && (
        <Popover anchor={anchor} onClose={close} align="start" className="panel-menu" role="dialog" label="Panels">
          <div className="panel-list">
            {panels.map((panel) => (
              <div
                key={panel.id}
                className={panel.id === selected ? "panel-row selected" : "panel-row"}
              >
                {renaming === panel.id ? (
                  <form className="panel-rename" onSubmit={commitRename}>
                    {/* A label of its own: wrapping the field and the button in
                        one would hand the button the label as its name. */}
                    <label className="sr-only" htmlFor="panel-name">
                      Name for this panel
                    </label>
                    <input
                      id="panel-name"
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={panelLabel(panel)}
                      maxLength={48}
                    />
                    <button type="submit" className="primary">
                      Save
                    </button>
                  </form>
                ) : (
                  <>
                    <button className="panel-choose" onClick={() => choose(panel.id)}>
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
                    <button
                      className="icon-button plain"
                      aria-label={`Rename ${panelLabel(panel)}`}
                      title="Rename"
                      onClick={() => {
                        setRenaming(panel.id);
                        setDraft(panel.name || "");
                      }}
                    >
                      <PencilIcon size={14} />
                    </button>
                    {/* Only offered for a panel that is not here. A panel that
                        is online is one you can see working, and forgetting it
                        would last until its next message -- which is seconds.
                        Its dashboard is kept either way; see panels.py. */}
                    {!panel.online && (
                      <button
                        className="panel-forget"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove ${panelLabel(panel)} from the list? Its pages are kept, ` +
                                "and it will come back by itself if it is switched on again."
                            )
                          ) {
                            close();
                            onForget(panel.id);
                          }
                        }}
                      >
                        Forget
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
            {panels.length === 0 && (
              <p className="panel-empty">
                No panel yet. Switch one on; it appears here once it reaches the MQTT broker.
              </p>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}
