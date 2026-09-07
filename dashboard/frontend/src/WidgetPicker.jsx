import { useMemo, useState } from "react";

import { Picker, PickerSearch } from "./Picker.jsx";
import { paletteShot } from "./widgetShots.js";
import { hasChipRow, isChipType } from "./layout.js";

// Adding a widget. This was a rail down the side of the workspace and a
// horizontally scrolling strip on a phone -- seventeen buttons in one
// undifferentiated list, in a strip whose last few items were off screen with
// nothing to say so.
//
// It is a sheet now, opened from one button, which buys back a whole column of
// the workspace and one of the stacked bars on mobile. The cost is a tap: worth
// it, because adding a widget happens a handful of times per page while the
// space it was taking was taken the whole time.
//
// The groups come from the firmware's manifest rather than a list kept here, so
// a widget added to WidgetRegistry arrives already filed. A manifest with no
// categories in it -- any firmware older than this -- puts everything under one
// unnamed group, which is exactly the flat list this replaced and is the right
// thing to degrade to.

const ALL = "__all__";
const OTHER = "__other__";

export default function WidgetPicker({ manifest, chipRow, onAdd, onClose }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(ALL);

  const types = manifest?.widgets || [];

  // Groups the firmware named, in its order, and only those that have
  // something in them. Anything filed under a name this manifest does not
  // declare -- or under nothing at all -- collects in "Other" so that a widget
  // can never become unreachable by being mislabelled.
  const groups = useMemo(() => {
    const declared = manifest?.categories || [];
    const known = new Set(declared.map((one) => one.id));
    const counted = declared
      .map((one) => ({
        ...one,
        count: types.filter((type) => type.category === one.id).length,
      }))
      .filter((one) => one.count > 0);

    const orphans = types.filter((type) => !known.has(type.category)).length;
    if (orphans > 0 && counted.length > 0) {
      counted.push({ id: OTHER, label: "Other", count: orphans });
    }
    return counted;
  }, [manifest, types]);

  const needle = query.trim().toLowerCase();

  const shown = useMemo(() => {
    const known = new Set((manifest?.categories || []).map((one) => one.id));
    return types.filter((type) => {
      // Searching looks across every group: someone typing "clock" should not
      // have to know which group it was filed under.
      if (needle) return type.label.toLowerCase().includes(needle) || type.type.includes(needle);
      if (group === ALL) return true;
      if (group === OTHER) return !known.has(type.category);
      return type.category === group;
    });
  }, [types, needle, group, manifest]);

  return (
    <Picker title="Add widget" onClose={onClose}>
      <PickerSearch value={query} onChange={setQuery} placeholder="Search widgets…" />

      {/* One group means one tab, which is not a choice. */}
      {!needle && groups.length > 1 && (
        <div className="picker-groups" role="group" aria-label="Widget groups">
          <button
            className={group === ALL ? "chip active" : "chip"}
            onClick={() => setGroup(ALL)}
          >
            All
            <small>{types.length}</small>
          </button>
          {groups.map((one) => (
            <button
              key={one.id}
              className={group === one.id ? "chip active" : "chip"}
              onClick={() => setGroup(one.id)}
            >
              {one.label}
              <small>{one.count}</small>
            </button>
          ))}
        </div>
      )}

      <div className="widget-grid">
        {shown.map((type) => {
          const shot = paletteShot(type.type);
          // A chip needs a chip row to sit in. On a page with none it is shown
          // but not addable, rather than dropped from the list -- the reason it
          // is unavailable is then visible, and the fix is one setting away.
          const needsRow = isChipType(type) && !hasChipRow(chipRow);
          return (
            <button
              key={type.type}
              className="widget-card"
              disabled={needsRow}
              title={needsRow ? "This page has no chip row" : undefined}
              onClick={() => {
                onAdd(type);
                onClose();
              }}
            >
              <span className="widget-card-shot">
                {/* A widget a newer firmware offers but that has no render yet
                    still lists, just without a picture. */}
                {shot && <img src={shot.url} alt="" draggable={false} />}
              </span>
              <span className="widget-card-label">{type.label}</span>
              <span className="widget-card-size">
                {needsRow
                  ? "needs a chip row"
                  : type.size_from || !type.width
                    ? "sizes to fit"
                    : `${type.width}×${type.height}`}
              </span>
            </button>
          );
        })}

        {shown.length === 0 && <p className="hint picker-empty">No widget matches that.</p>}
      </div>
    </Picker>
  );
}
