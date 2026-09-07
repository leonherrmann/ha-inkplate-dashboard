// What an entity *is*, in the words a person building a dashboard uses.
//
// The picker's second step used to offer Home Assistant's domains. That barely
// narrows anything: `sensor` is where most of an install lands, so choosing it
// left the same long list it was meant to shorten, while `binary_sensor` hid
// doors, windows, motion and damp behind a word nobody says out loud.
//
// So a kind is domain *and* device_class together. The backend now sends the
// class on /api/entities for exactly this.
//
// Order is the order the tiles appear in. Roughly most-asked-for first, with
// the catch-alls last, because a step whose first tile is "Other" reads as a
// step that has not understood the question.

const KINDS = [
  { id: "light", label: "Lights", glyph: "◐", domains: ["light"] },
  {
    id: "switch",
    label: "Switches & plugs",
    glyph: "⏻",
    domains: ["switch", "input_boolean"],
  },
  {
    id: "opening",
    label: "Doors & windows",
    glyph: "▤",
    domains: ["cover"],
    classes: ["door", "window", "garage", "garage_door", "opening", "gate", "shutter", "blind", "curtain", "awning", "damper"],
  },
  {
    id: "temperature",
    label: "Temperature",
    glyph: "▲",
    classes: ["temperature"],
  },
  { id: "humidity", label: "Humidity", glyph: "◇", classes: ["humidity", "moisture"] },
  {
    id: "air",
    label: "Air quality",
    glyph: "◈",
    classes: [
      "carbon_dioxide",
      "carbon_monoxide",
      "pm1",
      "pm25",
      "pm10",
      "volatile_organic_compounds",
      "volatile_organic_compounds_parts",
      "nitrogen_dioxide",
      "ozone",
      "aqi",
      "gas",
    ],
  },
  {
    id: "power",
    label: "Power & energy",
    glyph: "◼",
    classes: ["power", "energy", "current", "voltage", "power_factor", "apparent_power", "reactive_power"],
  },
  { id: "climate", label: "Heating & cooling", glyph: "◉", domains: ["climate", "water_heater"] },
  { id: "media", label: "Media", glyph: "▶", domains: ["media_player"] },
  {
    id: "motion",
    label: "Motion & presence",
    glyph: "◎",
    domains: ["device_tracker", "person"],
    classes: ["motion", "occupancy", "presence"],
  },
  { id: "lock", label: "Locks", glyph: "⬒", domains: ["lock"] },
  { id: "fan", label: "Fans", glyph: "✳", domains: ["fan", "humidifier"] },
  { id: "battery", label: "Batteries", glyph: "▮", classes: ["battery", "battery_charging"] },
  { id: "weather", label: "Weather", glyph: "☁", domains: ["weather"] },
  { id: "vacuum", label: "Vacuums", glyph: "◍", domains: ["vacuum", "lawn_mower"] },
  { id: "update", label: "Updates", glyph: "↑", domains: ["update"] },
  // The catch-alls. A binary sensor with no class is still a yes/no thing and
  // says more than "Other" would; anything left really is other.
  { id: "state", label: "On / off", glyph: "◔", domains: ["binary_sensor", "input_select", "select"] },
  { id: "reading", label: "Other readings", glyph: "◌", domains: ["sensor", "number", "input_number"] },
];

const OTHER = { id: "other", label: "Other", glyph: "◌" };

// The class is asked first: a `sensor` with device_class `temperature` is a
// temperature before it is a sensor, and that is the whole point of this file.
// A domain match only wins where no kind claims the class.
export function entityKind(entity) {
  const domain = entity.domain || entity.entity_id?.split(".", 1)[0] || "";
  const deviceClass = entity.device_class || "";

  if (deviceClass) {
    const byClass = KINDS.find((kind) => kind.classes?.includes(deviceClass));
    if (byClass) return byClass.id;
  }
  const byDomain = KINDS.find((kind) => kind.domains?.includes(domain));
  return byDomain ? byDomain.id : OTHER.id;
}

// The kinds actually present, in KINDS order, each with how many it holds.
// Only what is there: offering "Vacuums (0)" in a house with no vacuum is a
// tile that can only disappoint.
export function kindsPresent(entities) {
  const counts = new Map();
  for (const entity of entities) {
    const id = entityKind(entity);
    counts.set(id, (counts.get(id) || 0) + 1);
  }

  return [...KINDS, OTHER]
    .filter((kind) => counts.has(kind.id))
    .map((kind) => ({ ...kind, count: counts.get(kind.id) }));
}

export function kindLabel(id) {
  return [...KINDS, OTHER].find((kind) => kind.id === id)?.label || id;
}
