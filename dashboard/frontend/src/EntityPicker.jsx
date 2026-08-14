import { useMemo, useState } from "react";

// Entities are grouped by the area Home Assistant puts them in, with a search
// box, because picking "sensor.temperature_1_temperature" out of a flat list of
// several hundred is the slowest part of building a dashboard.
export default function EntityPicker({ entities, value, domain, onChange }) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matching = entities.filter((entity) => {
      if (domain && entity.domain !== domain) return false;
      if (!needle) return true;
      return (
        entity.name.toLowerCase().includes(needle) ||
        entity.entity_id.toLowerCase().includes(needle)
      );
    });

    const byArea = new Map();
    for (const entity of matching) {
      const area = entity.area || "No area";
      if (!byArea.has(area)) byArea.set(area, []);
      byArea.get(area).push(entity);
    }

    return [...byArea.entries()]
      .sort(([a], [b]) => {
        // "No area" sinks to the bottom, everything else alphabetical
        if (a === "No area") return 1;
        if (b === "No area") return -1;
        return a.localeCompare(b);
      })
      .map(([area, items]) => [area, items.sort((a, b) => a.name.localeCompare(b.name))]);
  }, [entities, domain, query]);

  const selected = entities.find((entity) => entity.entity_id === value);

  return (
    <div className="entity-picker">
      <input
        className="entity-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={domain ? `Search ${domain}…` : "Search entities…"}
      />

      <select
        size={8}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="entity-list"
      >
        <option value="">— none —</option>
        {groups.map(([area, items]) => (
          <optgroup key={area} label={area}>
            {items.map((entity) => (
              <option key={entity.entity_id} value={entity.entity_id}>
                {entity.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {selected && <div className="entity-id">{selected.entity_id}</div>}
      {entities.length === 0 && (
        <div className="hint">
          No entities. The add-on reads them from Home Assistant, which only works when it
          runs as an add-on rather than on a laptop.
        </div>
      )}
    </div>
  );
}
