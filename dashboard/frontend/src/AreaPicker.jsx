import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

// Picking an *area* for the room widget. Same shape as DevicePicker, and for
// the same reason: Home Assistant's area registry is websocket-only and the
// panel has no credentials for it, so the editor resolves an area to its
// entities here and writes plain entity ids into the layout. `area` travels
// alongside purely so the editor can re-resolve it later.

// What picking an area fills in, before the user prunes it by hand. The room
// card aggregates rather than lists, so this is a subscription budget, not a
// layout one -- it matches ROOM_MAX_ENTITIES in the firmware, published as
// every room size's capacity.
export const MAX_ROOM_ENTITIES = 12;

function Modal({ areas, value, onPick, onClose }) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return areas;
    return areas.filter((area) => area.name.toLowerCase().includes(needle));
  }, [areas, query]);

  // Portalled for the reason EntityPicker.jsx explains at length: the
  // Inspector wraps every option in a <label>, and Safari forwards a click
  // anywhere inside a label to the first labelable descendant.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>Choose room</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <input
          autoFocus
          className="modal-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name…"
        />

        <div className="modal-list">
          <button
            className={!value ? "entity-row active" : "entity-row"}
            onClick={() => onPick(null)}
          >
            <span className="entity-row-name">— none —</span>
          </button>

          {matching.map((area) => (
            <button
              key={area.id}
              className={area.id === value ? "entity-row active" : "entity-row"}
              onClick={() => onPick(area)}
            >
              <span className="entity-row-name">{area.name}</span>
              <span className="entity-row-meta">
                {/* The count says whether this area is worth a card at all */}
                {area.entities.length}{" "}
                {area.entities.length === 1 ? "entity" : "entities"}
              </span>
            </button>
          ))}

          {matching.length === 0 && <p className="hint">Nothing matches.</p>}
        </div>

        <div className="modal-foot">
          {matching.length} of {areas.length}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function AreaPicker({ areas, value, chosen, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = areas.find((area) => area.id === value);

  // An area the registry no longer knows about -- renamed or deleted since it
  // was picked. Its id is opaque, so this is a real state, not a hypothetical:
  // the card keeps working off the entity ids already in the layout.
  const missing = value && !selected;

  return (
    <>
      <button className="entity-trigger" onClick={() => setOpen(true)}>
        {selected ? (
          <>
            <span className="entity-trigger-name">{selected.name}</span>
            <span className="entity-trigger-meta">{chosen?.length || 0} shown</span>
          </>
        ) : (
          <span className="entity-trigger-empty">{value ? value : "Choose room…"}</span>
        )}
      </button>

      {missing && (
        <div className="hint">
          Home Assistant no longer lists this room. The card still draws the{" "}
          {chosen?.length || 0} entities already chosen; pick it again to refresh
          them.
        </div>
      )}

      {areas.length === 0 && (
        <div className="hint">
          No rooms. The add-on reads them from Home Assistant, which only works
          when it runs as an add-on rather than on a laptop.
        </div>
      )}

      {open && (
        <Modal
          areas={areas}
          value={value}
          onClose={() => setOpen(false)}
          onPick={(area) => {
            // Closed before the change is applied, not after -- see
            // EntityPicker.jsx for why that order matters.
            setOpen(false);
            onChange(area);
          }}
        />
      )}
    </>
  );
}
