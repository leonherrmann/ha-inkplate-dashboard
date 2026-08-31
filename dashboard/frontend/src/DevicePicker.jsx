import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

// Picking a *device* rather than an entity. Home Assistant's model is that a
// device is the physical thing and entities hang off it, and for a sensor that
// reports four readings that is the more useful object to put on a card.
//
// Choosing one resolves it to its entities here, in the editor, and writes the
// list into the layout. The panel is never told what a device is: the registry
// is websocket-only and needs credentials it does not have, so the firmware
// still only ever sees entity ids. See the device widget in the firmware repo.

const ALL = "__all__";

// What picking a device fills in. Six is what the largest card draws, so a
// seventh could never be seen -- and every entity written here costs the panel a
// state subscription plus one per attribute its domain wants, which on a full
// dashboard is the difference between a hundred topics and a thousand. The list
// arrives ranked, so this keeps the ones that matter; the inspector's entity
// list can then add, remove or reorder them by hand.
export const MAX_DEVICE_ENTITIES = 6;

function Modal({ devices, value, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState(ALL);

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const areas = useMemo(() => {
    const names = new Set(devices.map((device) => device.area || "No area"));
    return [...names].sort((a, b) => {
      if (a === "No area") return 1;
      if (b === "No area") return -1;
      return a.localeCompare(b);
    });
  }, [devices]);

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return devices.filter((device) => {
      if (area !== ALL && (device.area || "No area") !== area) return false;
      if (!needle) return true;
      return (
        device.name.toLowerCase().includes(needle) ||
        device.manufacturer.toLowerCase().includes(needle) ||
        device.model.toLowerCase().includes(needle) ||
        device.entities.some((one) => one.entity_id.toLowerCase().includes(needle))
      );
    });
  }, [devices, area, query]);

  // Portalled for the same reason EntityPicker is: the Inspector wraps every
  // option in a <label>, and Safari forwards a click anywhere inside a label to
  // the first labelable descendant -- here the trigger that opens this. See
  // EntityPicker.jsx for the full account.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>Choose device</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <input
          autoFocus
          className="modal-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, make or model…"
        />

        <div className="tabs">
          <button
            className={area === ALL ? "tab active" : "tab"}
            onClick={() => setArea(ALL)}
          >
            All areas
          </button>
          {areas.map((name) => (
            <button
              key={name}
              className={area === name ? "tab active" : "tab"}
              onClick={() => setArea(name)}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="modal-list">
          <button
            className={!value ? "entity-row active" : "entity-row"}
            onClick={() => onPick(null)}
          >
            <span className="entity-row-name">— none —</span>
          </button>

          {matching.map((device) => (
            <button
              key={device.id}
              className={device.id === value ? "entity-row active" : "entity-row"}
              onClick={() => onPick(device)}
            >
              <span className="entity-row-name">{device.name}</span>
              <span className="entity-row-meta">
                {device.area || "No area"} ·{" "}
                {/* The count is the useful fact: it says whether this device is
                    worth a card at all, or whether one entity would do. */}
                {device.entities.length}{" "}
                {device.entities.length === 1 ? "entity" : "entities"}
                {device.manufacturer && ` · ${device.manufacturer}`}
              </span>
            </button>
          ))}

          {matching.length === 0 && <p className="hint">Nothing matches.</p>}
        </div>

        <div className="modal-foot">
          {matching.length} of {devices.length}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function DevicePicker({ devices, value, chosen, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = devices.find((device) => device.id === value);

  // A device the registry no longer knows about. Its id is an opaque hash and
  // changes if the device is removed and re-added, so this is a real state and
  // not a hypothetical -- the card keeps working, because the entity ids in the
  // layout are what the panel actually renders from.
  const missing = value && !selected;

  return (
    <>
      <button className="entity-trigger" onClick={() => setOpen(true)}>
        {selected ? (
          <>
            <span className="entity-trigger-name">{selected.name}</span>
            <span className="entity-trigger-meta">
              {selected.area || "No area"} · {chosen?.length || 0} shown
            </span>
          </>
        ) : (
          <span className="entity-trigger-empty">
            {value ? value : "Choose device…"}
          </span>
        )}
      </button>

      {missing && (
        <div className="hint">
          Home Assistant no longer lists this device. The card still draws the{" "}
          {chosen?.length || 0} entities already chosen; pick it again to refresh
          them.
        </div>
      )}

      {devices.length === 0 && (
        <div className="hint">
          No devices. The add-on reads them from Home Assistant, which only works when it
          runs as an add-on rather than on a laptop.
        </div>
      )}

      {open && (
        <Modal
          devices={devices}
          value={value}
          onClose={() => setOpen(false)}
          onPick={(device) => {
            // Closed before the change is applied, not after -- anything that
            // throws inside onChange used to leave the modal open with Escape
            // as the only way out. See EntityPicker.jsx.
            setOpen(false);
            onChange(device);
          }}
        />
      )}
    </>
  );
}
