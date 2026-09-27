import EntityPicker from "./EntityPicker.jsx";
import { TrashIcon } from "./Icons.jsx";

// A list of entities of one kind -- the climate card's radiators. Each is the
// ordinary entity picker, so one is swapped for another the way any entity
// option is, with a button beside it to take it off; the last row is the same
// picker empty, and adds one. Nothing new to learn: it is the entity option,
// several times.
//
// An entity already in the list is not offered again, by any row but its own.
// Past `max` -- the most the firmware reads, from the manifest -- there is no
// row to add with, rather than a row that adds something the card ignores.

export default function EntityList({ entities, value, domain, max, onChange }) {
  // A layout from before the option was a list holds one id as a string.
  const picked = Array.isArray(value) ? value : value ? [value] : [];
  const without = (keep) =>
    entities.filter((one) => one.entity_id === keep || !picked.includes(one.entity_id));

  return (
    <div className="entity-list">
      {picked.map((id, index) => (
        <div className="entity-list-row" key={id}>
          <EntityPicker
            entities={without(id)}
            value={id}
            domain={domain}
            clearable={false}
            onChange={(next) =>
              onChange(next ? picked.map((one, at) => (at === index ? next : one)) : picked.filter((_, at) => at !== index))
            }
          />
          <button
            type="button"
            className="icon-button plain"
            aria-label="Remove"
            onClick={() => onChange(picked.filter((_, at) => at !== index))}
          >
            <TrashIcon size={14} />
          </button>
        </div>
      ))}
      {(!max || picked.length < max) && (
        <EntityPicker
          entities={without(null)}
          value=""
          domain={domain}
          placeholder="Add…"
          clearable={false}
          onChange={(next) => next && onChange([...picked, next])}
        />
      )}
    </div>
  );
}
