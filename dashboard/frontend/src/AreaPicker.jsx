import { useMemo, useState } from "react";

import { Picker, PickerSearch, PickerTiles } from "./Picker.jsx";

// Picking an *area* for the room widget. Home Assistant's area registry is
// websocket-only and the panel has no credentials for it, so the editor
// resolves an area to its entities here and writes plain entity ids into the
// layout. `area` travels alongside purely so the editor can re-resolve it.
//
// Tiles rather than the other pickers' rows, and no steps at all: rooms are the
// step everything else is filtered by, so there is nothing above them to filter
// by in turn, and a house has a dozen of them rather than a hundred. A grid
// shows the whole house at once where a list would need scrolling.

// What picking an area fills in, before the user prunes it by hand. The room
// card aggregates rather than lists, so this is a subscription budget, not a
// layout one -- it matches ROOM_MAX_ENTITIES in the firmware, published as
// every room size's capacity.
export const MAX_ROOM_ENTITIES = 12;

function Body({ areas, value, onPick }) {
  const [query, setQuery] = useState("");

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = needle ? areas.filter((area) => area.name.toLowerCase().includes(needle)) : areas;
    return pool.map((area) => ({
      id: area.id,
      label: area.name,
      // The count says whether this room is worth a card at all
      count: area.entities.length,
      area,
    }));
  }, [areas, query]);

  return (
    <>
      <PickerSearch value={query} onChange={setQuery} placeholder="Search rooms…" />

      {matching.length > 0 ? (
        <PickerTiles items={matching} onPick={(item) => onPick(item.area)} />
      ) : (
        <p className="hint picker-empty">Nothing matches that search.</p>
      )}

      {value && (
        <button className="picker-clear" onClick={() => onPick(null)}>
          Clear the room
        </button>
      )}
    </>
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
          {chosen?.length || 0} entities already chosen; pick it again to refresh them.
        </div>
      )}

      {areas.length === 0 && (
        <div className="hint">
          No rooms. The add-on reads them from Home Assistant, which only works when it
          runs as an add-on rather than on a laptop.
        </div>
      )}

      {open && (
        <Picker title="Choose room" onClose={() => setOpen(false)}>
          <Body
            areas={areas}
            value={value}
            onPick={(area) => {
              // Closed before the change is applied -- see EntityPicker.jsx.
              setOpen(false);
              onChange(area);
            }}
          />
        </Picker>
      )}
    </>
  );
}
