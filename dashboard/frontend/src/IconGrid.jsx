import { useState } from "react";

import { Picker } from "./Picker.jsx";
import { ICON_GLYPHS, ICON_VIEW_BOX } from "./iconGlyphs.js";

// Choosing an icon by looking at it.
//
// This was a list of names -- "entity_roller_shades_closed" over "entity_roller_shades"
// -- which asks you to know the drawing each one stands for, and to tell two
// apart by reading them. Seventy of them. The outlines are in iconGlyphs.js,
// copied from the firmware by tools/icon-glyphs.py, so the editor can show the
// same picture the panel will draw.
//
// A name with no glyph still appears, as its name. The two repos are released
// separately and the manifest is what says which icons exist, so the firmware
// can be a version ahead: an icon it has gained lists immediately and is drawn
// once the generator is re-run. Dropping it instead would hide a working icon.

// What the sections are, for the one list long enough to need them.
//
// Presentational, and only here: the firmware groups its icons by the folder
// they live in -- entity, rooms, status -- which is about which widget draws
// them, not about what they depict. Seventy entity icons in one grid is a wall,
// and "is the valve icon before or after the thermostat" has no answer worth
// learning, so they are grouped the way someone looking for one would guess.
//
// Anything not listed falls into the last section rather than vanishing, which
// is what makes this safe to leave alone when the firmware gains an icon.
const GROUPS = [
  ["Lighting", ["light", "lightbulb", "lightbulb_on", "light_mode", "dark_mode", "wb_sunny"]],
  ["Climate", [
    "thermostat", "mode_heat", "mode_cool", "mode_heat_cool", "mode_fan", "ac_unit",
    "humidity_percentage", "water_drop", "water", "water_heater", "local_fire_department", "eco",
  ]],
  ["Air", [
    "air", "aq_indoor", "co2", "sensors", "motion_sensor_active",
    "detector_smoke", "detector_co", "smoke_free",
  ]],
  ["Doors and windows", [
    "door_front", "door_open", "window", "window_open", "window_closed", "sensor_window",
    "garage", "garage_door", "blinds", "blinds_closed", "curtains", "curtains_closed",
    "roller_shades", "roller_shades_closed",
  ]],
  ["Security", ["lock", "lock_open", "shield", "shield_lock", "warning"]],
  ["Media", ["play_arrow", "pause", "music_note", "speaker", "volume_up", "tv"]],
  ["Power", ["bolt", "power", "battery_full", "battery_alert", "gas_meter", "speed"]],
  ["Rooms and living", [
    "bed", "chair", "couch", "desk", "checkroom", "hanger", "kitchen", "shower",
    "hallway", "local_laundry_service",
  ]],
  ["Anything else", []],
];

// Below this a grid is short enough to read at a glance, and headings over it
// are furniture. The rooms list is ten.
const GROUP_FROM = 16;

// A name without its option's prefix: "rooms_shower" is shown as "shower", since
// every name in that list carries the same "rooms_" and repeating it says
// nothing. Without a filter the whole name is used, underscores and all.
export function iconLabel(name, filter) {
  const bare = filter && name.startsWith(filter) ? name.slice(filter.length) : String(name);
  return bare.replace(/_/g, " ");
}

// The key GROUPS is written in: names as the firmware's folders leave them,
// without the group prefix, so one entry covers "entity_light" and a "light"
// that arrives some other way.
function bare(name) {
  const cut = String(name).indexOf("_");
  return cut === -1 ? String(name) : String(name).slice(cut + 1);
}

export function IconGlyph({ name, className = "icon-glyph" }) {
  const path = ICON_GLYPHS[name];
  if (!path) return null;
  return (
    <svg className={className} viewBox={ICON_VIEW_BOX} aria-hidden="true" focusable="false">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

function Tile({ name, label, selected, onChange }) {
  const glyph = ICON_GLYPHS[name];
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      // The name as well as the label: a screen reader gets "roller shades
      // closed" either way, but the tooltip is what tells a sighted user which
      // of two near-identical outlines they are looking at.
      title={label}
      className={selected ? "icon-tile selected" : "icon-tile"}
      onClick={() => onChange(name)}
    >
      {glyph ? <IconGlyph name={name} /> : <span className="icon-tile-missing" aria-hidden="true">?</span>}
      <span className="icon-tile-label">{label}</span>
    </button>
  );
}

export function IconGrid({ option, values, value, onChange }) {
  const [query, setQuery] = useState("");

  const label = (name) => iconLabel(name, option.filter);
  const terms = query.trim().toLowerCase();
  const shown = terms
    ? values.filter((name) => `${name} ${label(name)}`.toLowerCase().includes(terms))
    : values;

  // Searching flattens the sections. Headings over three grids of two are noise
  // when the question has already been narrowed to "which of these".
  const sections = [];
  if (terms || values.length < GROUP_FROM) {
    sections.push([null, shown]);
  } else {
    const left = new Set(shown);
    for (const [heading, names] of GROUPS) {
      const found = shown.filter((name) => names.includes(bare(name)));
      for (const name of found) left.delete(name);
      if (found.length) sections.push([heading, found]);
    }
    // Whatever no group claimed, under the last heading -- which is why that
    // one is declared with an empty list rather than filled in by hand.
    const rest = shown.filter((name) => left.has(name));
    if (rest.length) {
      const last = GROUPS[GROUPS.length - 1][0];
      const existing = sections.find(([heading]) => heading === last);
      if (existing) existing[1] = existing[1].concat(rest);
      else sections.push([last, rest]);
    }
  }

  return (
    <>
      {values.length > 12 && (
        <label className="option-search">
          <span className="sr-only">Search {option.label}</span>
          <input
            type="search"
            value={query}
            placeholder={`Search ${values.length} icons`}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}

      {/* Clearing stays a row rather than becoming a tile with nothing drawn on
          it: "no icon" is not one of the pictures, and a blank square among them
          reads as an icon that failed to load. */}
      <button
        type="button"
        role="option"
        aria-selected={!value}
        className={!value ? "option-item selected" : "option-item"}
        onClick={() => onChange("")}
      >
        Default
      </button>

      <div className="icon-sections" role="listbox" aria-label={option.label}>
        {sections.map(([heading, names]) => (
          <section key={heading || "all"}>
            {heading && <h4 className="icon-section-heading">{heading}</h4>}
            <div className="icon-grid">
              {names.map((name) => (
                <Tile
                  key={name}
                  name={name}
                  label={label(name)}
                  selected={name === value}
                  onChange={onChange}
                />
              ))}
            </div>
          </section>
        ))}

        {shown.length === 0 && <p className="hint">Nothing matches “{query}”.</p>}
      </div>
    </>
  );
}

// The same grid on a wide screen, where an icon option is one field among a
// dozen rather than a screen of its own.
//
// A trigger and a modal, which is how this editor has picked an entity, a device
// and a room for some time -- rather than the <select> of seventy names that was
// here, where telling "roller shades" from "roller shades closed" meant knowing
// both drawings in advance. The grid inside is the one the phone gets; only the
// shell around it differs.
export function IconField({ option, values, value, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="entity-trigger icon-trigger" onClick={() => setOpen(true)}>
        {value ? (
          <>
            <IconGlyph name={value} className="icon-trigger-glyph" />
            <span className="entity-trigger-name">{iconLabel(value, option.filter)}</span>
          </>
        ) : (
          <span className="entity-trigger-empty">Choose icon…</span>
        )}
      </button>

      {open && (
        <Picker title={`Choose ${String(option.label || "icon").toLowerCase()}`} onClose={() => setOpen(false)}>
          <IconGrid
            option={option}
            values={values}
            value={value}
            onChange={(next) => {
              // Closed before the change is applied, as the other pickers do.
              setOpen(false);
              onChange(next);
            }}
          />
        </Picker>
      )}
    </>
  );
}
