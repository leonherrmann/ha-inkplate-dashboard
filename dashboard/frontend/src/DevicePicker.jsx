import { useMemo, useState } from "react";

import { Picker, PickerCrumbs, PickerRows, PickerSearch, PickerTiles } from "./Picker.jsx";

// Picking a *device* rather than an entity. Home Assistant's model is that a
// device is the physical thing and entities hang off it, and for a sensor that
// reports four readings that is the more useful object to put on a card.
//
// Choosing one resolves it to its entities here, in the editor, and writes the
// list into the layout. The panel is never told what a device is: the registry
// is websocket-only and needs credentials it does not have, so the firmware
// still only ever sees entity ids. See the device widget in the firmware repo.
//
// One step rather than the entity picker's two -- a device has no kind worth
// asking about, and its make and model are already searchable.

const ANY = "__any__";
const NO_AREA = "__no_area__";

// What picking a device fills in. Six is what the largest card draws, so a
// seventh could never be seen -- and every entity written here costs the panel a
// state subscription plus one per attribute its domain wants, which on a full
// dashboard is the difference between a hundred topics and a thousand. The list
// arrives ranked, so this keeps the ones that matter; the inspector's entity
// list can then add, remove or reorder them by hand.
export const MAX_DEVICE_ENTITIES = 6;

function Body({ devices, value, onPick }) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState(null);

  const areas = useMemo(() => {
    const counts = new Map();
    for (const device of devices) {
      const name = device.area || NO_AREA;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const named = [...counts.keys()].filter((name) => name !== NO_AREA).sort((a, b) => a.localeCompare(b));
    const order = counts.has(NO_AREA) ? [...named, NO_AREA] : named;
    return order.map((name) => ({
      id: name,
      label: name === NO_AREA ? "No room" : name,
      count: counts.get(name),
    }));
  }, [devices]);

  const needle = query.trim().toLowerCase();

  const rows = useMemo(() => {
    const pool = needle
      ? devices.filter(
          (device) =>
            device.name.toLowerCase().includes(needle) ||
            device.manufacturer.toLowerCase().includes(needle) ||
            device.model.toLowerCase().includes(needle) ||
            device.entities.some((one) => one.entity_id.toLowerCase().includes(needle))
        )
      : devices.filter((device) => !area || area === ANY || (device.area || NO_AREA) === area);

    return pool.map((device) => ({
      id: device.id,
      label: device.name,
      // The count is the useful fact: it says whether this device is worth a
      // card at all, or whether one entity would do.
      meta: `${device.area || "No room"} · ${device.entities.length} ${
        device.entities.length === 1 ? "entity" : "entities"
      }${device.manufacturer ? ` · ${device.manufacturer}` : ""}`,
      device,
    }));
  }, [needle, devices, area]);

  const askArea = areas.length > 1;
  const step = !needle && askArea && area === null ? "area" : "rows";

  return (
    <>
      <PickerSearch value={query} onChange={setQuery} placeholder="Search by name, make or model…" />

      {!needle && askArea && (
        <PickerCrumbs
          trail={[
            {
              label: area === null || area === ANY ? "All rooms" : area === NO_AREA ? "No room" : area,
              onClick: () => setArea(null),
            },
            { label: "Device" },
          ]}
        />
      )}

      {step === "area" ? (
        <PickerTiles
          items={[{ id: ANY, label: "All rooms", count: devices.length }, ...areas]}
          onPick={(item) => setArea(item.id)}
        />
      ) : (
        <PickerRows
          rows={[{ id: "", label: "— none —" }, ...rows]}
          value={value || ""}
          onPick={(row) => onPick(row.device || null)}
        />
      )}
    </>
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
              {selected.area || "No room"} · {chosen?.length || 0} shown
            </span>
          </>
        ) : (
          <span className="entity-trigger-empty">{value ? value : "Choose device…"}</span>
        )}
      </button>

      {missing && (
        <div className="hint">
          Home Assistant no longer lists this device. The card still draws the{" "}
          {chosen?.length || 0} entities already chosen; pick it again to refresh them.
        </div>
      )}

      {devices.length === 0 && (
        <div className="hint">
          No devices. The add-on reads them from Home Assistant, which only works when it
          runs as an add-on rather than on a laptop.
        </div>
      )}

      {open && (
        <Picker title="Choose device" onClose={() => setOpen(false)}>
          <Body
            devices={devices}
            value={value}
            onPick={(device) => {
              // Closed before the change is applied -- see EntityPicker.jsx.
              setOpen(false);
              onChange(device);
            }}
          />
        </Picker>
      )}
    </>
  );
}
