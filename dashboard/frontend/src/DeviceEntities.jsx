// Which of a device's entities the card draws, and in what order.
//
// Picking a device fills this in automatically, ranked so what the device is
// *for* comes before what it reports about itself — a door before its battery.
// That is a guess, though, and a good one only on average: whether the humidity
// or the CO2 belongs on the card is a matter of what the panel is for, which
// only the person looking at it knows.
//
// Order is not cosmetic. The card draws tiles until it runs out of room, so the
// list is also the priority: what sits at the bottom is what disappears when
// the widget is made smaller.

const CHECK = "✓";

export default function DeviceEntities({ available, chosen, capacity, onChange }) {
  if (!available?.length) return null;

  const picked = chosen || [];
  const byId = new Map(available.map((one) => [one.entity_id, one]));

  // Chosen ones first, in their own order, then the rest. Two lists in one, so
  // that reordering and enabling are the same gesture in the same place rather
  // than two panels to look between.
  const ordered = [
    ...picked.filter((id) => byId.has(id)).map((id) => byId.get(id)),
    ...available.filter((one) => !picked.includes(one.entity_id)),
  ];

  const toggle = (id) =>
    onChange(picked.includes(id) ? picked.filter((one) => one !== id) : [...picked, id]);

  const move = (id, by) => {
    const from = picked.indexOf(id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= picked.length) return;
    const next = [...picked];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
  };

  return (
    <div className="device-entities">
      <div className="device-entities-head">
        <span>
          {picked.length} of {available.length} chosen
        </span>
        {/* Capacity comes from the chosen size's own cell count in the
            manifest, so it cannot drift from what the firmware draws. */}
        {capacity > 0 && picked.length > capacity && (
          <span className="device-entities-warn">
            this size draws {capacity}
          </span>
        )}
      </div>

      <ul className="device-entities-list">
        {ordered.map((one) => {
          const isOn = picked.includes(one.entity_id);
          const at = picked.indexOf(one.entity_id);
          // Past what the card can draw: still chosen, just not visible at this
          // size. Said plainly rather than silently dropped, because a widget
          // that ignores a choice with no explanation reads as broken.
          const overflow = isOn && capacity > 0 && at >= capacity;

          return (
            <li
              key={one.entity_id}
              className={
                "device-entity" + (isOn ? " on" : "") + (overflow ? " overflow" : "")
              }
            >
              <button
                type="button"
                className="device-entity-toggle"
                onClick={() => toggle(one.entity_id)}
                aria-pressed={isOn}
              >
                <span className="device-entity-box">{isOn ? CHECK : ""}</span>
                <span className="device-entity-text">
                  <span className="device-entity-name">{one.name}</span>
                  <span className="device-entity-meta">
                    {one.domain}
                    {one.category && ` · ${one.category}`}
                    {overflow && " · not drawn at this size"}
                  </span>
                </span>
              </button>

              {isOn && (
                <span className="device-entity-order">
                  <button
                    type="button"
                    onClick={() => move(one.entity_id, -1)}
                    disabled={at === 0}
                    aria-label={`Move ${one.name} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(one.entity_id, 1)}
                    disabled={at === picked.length - 1}
                    aria-label={`Move ${one.name} down`}
                  >
                    ↓
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
