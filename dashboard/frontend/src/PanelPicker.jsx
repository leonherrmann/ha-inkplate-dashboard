import { useState } from "react";

import { Picker } from "./Picker.jsx";
import { MonitorIcon } from "./Icons.jsx";

// Which panel is being edited.
//
// The editor shows one at a time and everything in it -- the canvas, the pages,
// the settings, the Device screen -- follows this one choice, so the control
// sits where the identity already was rather than being a fifth thing in the
// header. With one panel it reads as the label it replaced; the chevron and the
// list only mean anything when there is something to choose between.
//
// The same Picker shell the entity, device and widget lists use, for the
// reasons given there: they were four hand-rolled modals that had drifted apart
// in ways that read as meaning.

const MODEL_LABELS = {
  inkplate5v1: "Inkplate 5",
  inkplate5v2: "Inkplate 5 V2",
};

export function panelLabel(panel) {
  if (!panel) return "Panel";
  return panel.name || MODEL_LABELS[panel.model] || "Panel";
}

export function panelSpec(panel) {
  if (!panel) return "";
  const size = panel.width && panel.height ? `${panel.width} × ${panel.height}` : "";
  const model = MODEL_LABELS[panel.model];
  return [model, size, "1-bit"].filter(Boolean).join(" · ");
}

export default function PanelPicker({ panels, selected, onSelect, onRename, onForget }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [draft, setDraft] = useState("");

  const current = panels.find((panel) => panel.id === selected) || panels[0] || null;
  // One panel is not a choice. The button still opens the list, because that is
  // where renaming lives, but it does not advertise a decision nobody has.
  const several = panels.length > 1;

  const choose = (id) => {
    setOpen(false);
    if (id !== selected) onSelect(id);
  };

  const commitRename = async (event) => {
    event.preventDefault();
    const id = renaming;
    setRenaming(null);
    await onRename(id, draft);
  };

  return (
    <>
      <button
        className="device-ident"
        onClick={() => setOpen(true)}
        title={several ? "Choose which panel to edit" : "This panel"}
        aria-haspopup="dialog"
      >
        <span className="device-mark">
          <MonitorIcon size={17} />
        </span>
        <span className="device-text">
          <span className="device-name">
            {panelLabel(current)}
            {several && <span className="device-chevron" aria-hidden="true" />}
          </span>
          <span className="device-spec">{panelSpec(current)}</span>
        </span>
      </button>

      {open && (
        <Picker title="Panels" onClose={() => setOpen(false)}>
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
                    <button type="submit" className="button small">
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
                          {panelSpec(panel)}
                          {!panel.has_manifest && " · not heard from yet"}
                        </span>
                      </span>
                    </button>
                    <button
                      className="button ghost small"
                      onClick={() => {
                        setRenaming(panel.id);
                        setDraft(panel.name || "");
                      }}
                    >
                      Rename
                    </button>
                    {/* Only offered for a panel that is not here. A panel that
                        is online is one you can see working, and forgetting it
                        would last until its next message -- which is seconds.
                        Its dashboard is kept either way; see panels.py. */}
                    {!panel.online && (
                      <button
                        className="button ghost small"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove ${panelLabel(panel)} from the list? Its pages are kept, ` +
                                "and it will come back by itself if it is switched on again."
                            )
                          ) {
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
                No panel has been seen yet. Power one on and make sure it reaches the same
                MQTT broker as Home Assistant.
              </p>
            )}
          </div>
          <p className="picker-note">
            Each panel keeps its own pages and settings. A panel appears here by itself, as
            soon as it is switched on.
          </p>
        </Picker>
      )}
    </>
  );
}
