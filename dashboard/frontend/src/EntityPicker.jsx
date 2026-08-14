import { useEffect, useMemo, useState } from "react";

// Picking an entity out of a flat list of several hundred was the slowest part
// of building a dashboard, so selection happens in a modal: search, area tabs,
// and a domain filter. The trigger shows the current choice.

const ALL = "__all__";

function Modal({ entities, value, domain, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState(ALL);
  const [domainFilter, setDomainFilter] = useState(domain || ALL);

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The option's own domain filter is a hard constraint; the chips only narrow
  // further within whatever it allows.
  const allowed = useMemo(
    () => (domain ? entities.filter((entity) => entity.domain === domain) : entities),
    [entities, domain]
  );

  const areas = useMemo(() => {
    const names = new Set(allowed.map((entity) => entity.area || "No area"));
    return [...names].sort((a, b) => {
      if (a === "No area") return 1;
      if (b === "No area") return -1;
      return a.localeCompare(b);
    });
  }, [allowed]);

  const domains = useMemo(
    () => [...new Set(allowed.map((entity) => entity.domain))].sort(),
    [allowed]
  );

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allowed
      .filter((entity) => {
        if (area !== ALL && (entity.area || "No area") !== area) return false;
        if (domainFilter !== ALL && entity.domain !== domainFilter) return false;
        if (!needle) return true;
        return (
          entity.name.toLowerCase().includes(needle) ||
          entity.entity_id.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allowed, area, domainFilter, query]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>Choose entity</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <input
          autoFocus
          className="modal-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or id…"
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

        {/* Only worth showing when the option does not already pin the domain */}
        {!domain && domains.length > 1 && (
          <div className="tabs domains">
            <button
              className={domainFilter === ALL ? "chip active" : "chip"}
              onClick={() => setDomainFilter(ALL)}
            >
              All
            </button>
            {domains.map((name) => (
              <button
                key={name}
                className={domainFilter === name ? "chip active" : "chip"}
                onClick={() => setDomainFilter(name)}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        <div className="modal-list">
          <button
            className={!value ? "entity-row active" : "entity-row"}
            onClick={() => onPick("")}
          >
            <span className="entity-row-name">— none —</span>
          </button>

          {matching.map((entity) => (
            <button
              key={entity.entity_id}
              className={entity.entity_id === value ? "entity-row active" : "entity-row"}
              onClick={() => onPick(entity.entity_id)}
            >
              <span className="entity-row-name">{entity.name}</span>
              <span className="entity-row-meta">
                {entity.area || "No area"} · {entity.entity_id}
              </span>
            </button>
          ))}

          {matching.length === 0 && <p className="hint">Nothing matches.</p>}
        </div>

        <div className="modal-foot">
          {matching.length} of {allowed.length}
        </div>
      </div>
    </div>
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
            <span className="entity-trigger-meta">{selected.area || "No area"}</span>
          </>
        ) : (
          <span className="entity-trigger-empty">
            {value ? value : "Choose entity…"}
          </span>
        )}
      </button>

      {entities.length === 0 && (
        <div className="hint">
          No entities. The add-on reads them from Home Assistant, which only works when it
          runs as an add-on rather than on a laptop.
        </div>
      )}

      {open && (
        <Modal
          entities={entities}
          value={value}
          domain={domain}
          onClose={() => setOpen(false)}
          onPick={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
