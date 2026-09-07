import { useMemo, useState } from "react";

import { Picker, PickerCrumbs, PickerRows, PickerSearch, PickerTiles } from "./Picker.jsx";
import { entityKind, kindLabel, kindsPresent } from "./entityKinds.js";

// Picking one entity out of several hundred, which was the slowest part of
// building a dashboard. It is a stepped browser: room, then what kind of thing,
// then the entity. Searching at any point skips straight to matches across
// everything, because someone who knows the name should not have to walk the
// steps to reach it.
//
// Steps that have nothing to ask are skipped rather than shown with one answer:
// an install with no areas set up never sees the room step, and an option that
// already pins its domain -- the climate card's temperature sensor -- never
// sees the kind step. Neither of those is a special case in the flow; both fall
// out of "a step with fewer than two answers has nothing to ask".

const ANY = "__any__";
const NO_AREA = "__no_area__";

function Body({ entities, value, domain, onPick }) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState(null);
  const [kind, setKind] = useState(null);

  // The option's own domain filter is a hard constraint, not a starting point:
  // the climate card cannot draw a media player whatever the user browses to.
  const allowed = useMemo(
    () => (domain ? entities.filter((entity) => entity.domain === domain) : entities),
    [entities, domain]
  );

  const areas = useMemo(() => {
    const counts = new Map();
    for (const entity of allowed) {
      const name = entity.area || NO_AREA;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    // Unassigned last: it is a leftovers bin, not a room, and sorting it under
    // N would bury it in the middle of the list.
    const named = [...counts.keys()].filter((name) => name !== NO_AREA).sort((a, b) => a.localeCompare(b));
    const order = counts.has(NO_AREA) ? [...named, NO_AREA] : named;
    return order.map((name) => ({
      id: name,
      label: name === NO_AREA ? "No room" : name,
      count: counts.get(name),
    }));
  }, [allowed]);

  const inArea = useMemo(() => {
    if (!area || area === ANY) return allowed;
    return allowed.filter((entity) => (entity.area || NO_AREA) === area);
  }, [allowed, area]);

  const kinds = useMemo(() => kindsPresent(inArea), [inArea]);

  const needle = query.trim().toLowerCase();

  // Search is deliberately across `allowed`, not across the current step: the
  // point of typing is that you already know what you want, and having it
  // silently exclude the other rooms would look like the entity is missing.
  const rows = useMemo(() => {
    const pool = needle
      ? allowed.filter(
          (entity) =>
            entity.name.toLowerCase().includes(needle) ||
            entity.entity_id.toLowerCase().includes(needle)
        )
      : inArea.filter((entity) => !kind || kind === ANY || entityKind(entity) === kind);

    return [...pool]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entity) => ({
        id: entity.entity_id,
        label: entity.name,
        meta: `${entity.area || "No room"} · ${entity.entity_id}`,
      }));
  }, [needle, allowed, inArea, kind]);

  // A step with fewer than two answers has nothing to ask.
  const askArea = areas.length > 1;
  const askKind = kinds.length > 1;

  // Which step is on screen. Searching overrides all of it.
  let step = "rows";
  if (!needle) {
    if (askArea && area === null) step = "area";
    else if (askKind && kind === null) step = "kind";
  }

  // The crumbs are also the only way back up. That matters most in the case
  // where a step was skipped: an option pinned to one domain has nothing to ask
  // in step two, so choosing a room went straight to the list -- and with a
  // single crumb the trail was hidden, leaving no route back to the other rooms
  // short of closing the sheet and reopening it. So the step you are on is
  // always the last crumb, which keeps the ones above it clickable.
  const trail = [];
  if (askArea) {
    trail.push({
      label: area === null || area === ANY ? "All rooms" : area === NO_AREA ? "No room" : area,
      onClick: () => {
        setArea(null);
        setKind(null);
      },
    });
  }
  if (askKind && step !== "area") {
    trail.push({
      label: kind && kind !== ANY ? kindLabel(kind) : "Anything",
      onClick: () => setKind(null),
    });
  }
  if (step === "rows" && trail.length > 0) {
    trail.push({ label: `${rows.length} to choose from` });
  }

  return (
    <>
      <PickerSearch value={query} onChange={setQuery} placeholder="Search by name or id…" />

      {!needle && <PickerCrumbs trail={trail} />}

      {step === "area" && (
        <PickerTiles
          items={[{ id: ANY, label: "All rooms", count: allowed.length }, ...areas]}
          onPick={(item) => setArea(item.id)}
        />
      )}

      {step === "kind" && (
        <PickerTiles
          items={[{ id: ANY, label: "Anything", glyph: "◇", count: inArea.length }, ...kinds]}
          onPick={(item) => setKind(item.id)}
        />
      )}

      {step === "rows" && (
        <PickerRows
          rows={[{ id: "", label: "— none —" }, ...rows]}
          value={value || ""}
          onPick={(row) => onPick(row.id)}
          empty={
            needle
              ? "Nothing matches that search."
              : "Nothing here. Step back and try another room."
          }
        />
      )}
    </>
  );
}

export default function EntityPicker({ entities, value, domain, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = entities.find((entity) => entity.entity_id === value);

  return (
    <>
      <button className="entity-trigger" onClick={() => setOpen(true)}>
        {selected ? (
          <>
            <span className="entity-trigger-name">{selected.name}</span>
            <span className="entity-trigger-meta">{selected.area || "No room"}</span>
          </>
        ) : (
          <span className="entity-trigger-empty">{value ? value : "Choose entity…"}</span>
        )}
      </button>

      {entities.length === 0 && (
        <div className="hint">
          No entities. The add-on reads them from Home Assistant, which only works when it
          runs as an add-on rather than on a laptop.
        </div>
      )}

      {open && (
        <Picker title="Choose entity" onClose={() => setOpen(false)}>
          <Body
            entities={entities}
            value={value}
            domain={domain}
            onPick={(next) => {
              // Closed before the change is applied, not after. Anything that
              // throws inside onChange used to leave the sheet open with
              // Escape as the only way out, which read as "picking an entity
              // does nothing" -- the choice had in fact been made.
              setOpen(false);
              onChange(next);
            }}
          />
        </Picker>
      )}
    </>
  );
}
