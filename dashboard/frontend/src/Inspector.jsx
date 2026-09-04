import EntityPicker from "./EntityPicker.jsx";
import DevicePicker, { MAX_DEVICE_ENTITIES } from "./DevicePicker.jsx";
import AreaPicker, { MAX_ROOM_ENTITIES } from "./AreaPicker.jsx";
import DeviceEntities from "./DeviceEntities.jsx";
import { imagePreviewUrl } from "./api.js";
import { LAYER_MOVES, widgetSize, widgetType } from "./layout.js";

// The room card's band readings, and how to find each one in an area.
//
// The firmware used to work these out itself by scanning the same list the
// buckets count. It is done here now, once, when a room is picked -- so what
// the band shows is written down and can be changed, rather than being a rule
// that has to be reverse-engineered from the drawing.
//
// The order within each role is the firmware's old preference, kept so that
// picking a room reproduces what the card already drew: a thermostat measures
// the room it is in, where a sensor called "temperature" might be a radiator
// valve or a fridge.
const ROOM_ROLES = [
  { key: "temperature", domains: ["climate"], classes: ["temperature"] },
  { key: "humidity", classes: ["humidity"] },
  { key: "pm25", classes: ["pm25"] },
  { key: "co2", classes: ["carbon_dioxide"] },
  { key: "climate", domains: ["climate"] },
];

const blankRoles = () =>
  Object.fromEntries(ROOM_ROLES.map((role) => [role.key, ""]));

// Which entity plays each part, and what is left for the list. An entity can
// hold two parts at once -- a thermostat is both the temperature and the
// heating -- but it is only ever counted once, and never in a bucket: it
// describes the room rather than being a thing in it.
function roomRoles(available) {
  const entities = available || [];
  const chosen = {};
  const taken = new Set();

  for (const role of ROOM_ROLES) {
    const match =
      (role.domains || []).reduce(
        (found, domain) => found || entities.find((one) => one.domain === domain),
        null
      ) ||
      (role.classes || []).reduce(
        (found, kind) => found || entities.find((one) => one.device_class === kind),
        null
      );
    chosen[role.key] = match ? match.entity_id : "";
    if (match) taken.add(match.entity_id);
  }

  return {
    ...chosen,
    entities: entities
      .filter((one) => !taken.has(one.entity_id))
      .slice(0, MAX_ROOM_ENTITIES)
      .map((one) => one.entity_id),
  };
}

function Option({ option, widget, value, entities, devices, areas, uploads, capacity, onChange, onChangeMany }) {
  // Picking a device sets three things at once, which is why this one option
  // reaches for onChangeMany: the id, so it can be re-resolved later; the
  // resolved entity list, which is what the panel actually renders; and the
  // name, prefilled because a device already has a good one and typing it again
  // is the sort of thing that makes an editor tiring.
  if (option.type === "device") {
    const device = devices.find((one) => one.id === value);
    return (
      <>
      <DevicePicker
        devices={devices}
        value={value}
        chosen={widget?.options?.entities}
        onChange={(device) => {
          if (!device) {
            onChangeMany({ device: "", entities: [] });
            return;
          }
          onChangeMany({
            device: device.id,
            entities: device.entities
              .slice(0, MAX_DEVICE_ENTITIES)
              .map((one) => one.entity_id),
            // Only if the name is still whatever the last device left, so a
            // name the user typed is never silently overwritten.
            ...(!widget?.options?.name || widget.options.name === widget.options.deviceName
              ? { name: device.name, deviceName: device.name }
              : {}),
          });
        }}
      />
      {/* Which of them to draw, and in what order. The ranking that lands here
          on picking a device is a good average guess and no more -- whether the
          CO2 or the humidity belongs on the card depends on what the panel is
          for. Capacity is the chosen size's own cell count from the manifest,
          so the editor never has to be told what the firmware draws. */}
      {device && (
        <DeviceEntities
          available={device.entities}
          chosen={widget?.options?.entities}
          capacity={capacity}
          onChange={(next) => onChangeMany({ entities: next })}
        />
      )}
      </>
    );
  }

  // Picking a room fills the whole card in: the readings that make up the band
  // each go to the option that draws them, and everything left over becomes the
  // list the buckets count. Every one of them stays editable afterwards -- this
  // is a good first answer, not a decision.
  //
  // The list itself is rendered after all the options rather than here, unlike
  // the device card's: the room has five named readings between the picker and
  // the list, and burying the list among them would read as one more of them.
  if (option.type === "area") {
    return (
      <AreaPicker
        areas={areas}
        value={value}
        chosen={widget?.options?.entities}
        onChange={(area) => {
          if (!area) {
            onChangeMany({ area: "", entities: [], ...blankRoles() });
            return;
          }
          onChangeMany({
            area: area.id,
            ...roomRoles(area.entities),
            ...(!widget?.options?.name || widget.options.name === widget.options.areaName
              ? { name: area.name, areaName: area.name }
              : {}),
          });
        }}
      />
    );
  }

  if (option.type === "entity") {
    return (
      <EntityPicker
        entities={entities}
        value={value}
        domain={option.filter}
        onChange={onChange}
      />
    );
  }

  // The firmware ships the values it accepts, so this cannot produce one it
  // would reject.
  if (option.type === "choice") {
    return (
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">— default —</option>
        {(option.values || []).map((choice) => (
          <option key={choice} value={choice}>
            {choice.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    );
  }

  // Newlines are meaningful to the text widget, so it needs a real textarea
  if (option.type === "text") {
    return (
      <textarea
        rows={3}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={option.filter || ""}
      />
    );
  }

  // The firmware ships the icon names it can resolve, so this cannot produce
  // something it will fail to draw.
  if (option.type === "icon") {
    return (
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">— default —</option>
        {(option.values || []).map((name) => (
          <option key={name} value={name}>
            {option.filter && name.startsWith(option.filter)
              ? name.slice(option.filter.length)
              : name}
          </option>
        ))}
      </select>
    );
  }

  // Image values carry their pixel size, which is also the widget's footprint.
  // Two sources: images uploaded to the add-on, and the ones compiled into the
  // firmware, which the manifest lists.
  if (option.type === "image") {
    const builtIn = option.values || [];
    return (
      <>
        <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
          <option value="">— none —</option>
          {uploads?.length > 0 && (
            <optgroup label="Uploaded">
              {uploads.map((image) => (
                <option key={image.name} value={image.name}>
                  {`${image.name} (${image.width}×${image.height})`}
                </option>
              ))}
            </optgroup>
          )}
          {builtIn.length > 0 && (
            <optgroup label="Built in">
              {builtIn.map((image) => (
                <option key={image.name} value={image.name}>
                  {(option.filter && image.name.startsWith(option.filter)
                    ? image.name.slice(option.filter.length)
                    : image.name) + ` (${image.width}×${image.height})`}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {uploads?.some((image) => image.name === value) && (
          <img className="option-preview" src={imagePreviewUrl(value)} alt={value} />
        )}
      </>
    );
  }

  return (
    <input
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder={option.filter || ""}
    />
  );
}

export default function Inspector({
  widget,
  manifest,
  chipRow,
  entities,
  devices,
  areas,
  uploads,
  layer,
  layerCount,
  onSetOption,
  onSetOptions,
  onSetSize,
  onSetLayer,
  onDuplicate,
  onRemove,
  onClose,
}) {
  if (!widget) {
    return (
      <aside className="inspector">
        <h2>Options</h2>
        <p className="hint">Tap a widget on the panel to edit it.</p>
      </aside>
    );
  }

  const type = widgetType(manifest, widget);
  const options = type?.options || [];
  // Measured against the page being edited: a card is taller on a page whose
  // chip row is off, and this line is what tells the user its footprint.
  const size = widgetSize(manifest, widget, undefined, chipRow);

  // How many entities the chosen size actually draws. The firmware publishes it
  // per size, because guessing from the cell count happened to be right for two
  // of the three device sizes and stopped being right the moment the card was
  // relaid out as a bento -- where every shape holds the same six, arranged
  // differently.
  const chosenSize = type?.sizes?.find(
    (one) => one.id === (widget.size || type.sizes?.[0]?.id)
  );
  const capacity = chosenSize?.capacity || 0;

  // The room this card is set to, if it is a room card at all. Its counted list
  // is rendered below the options rather than beside the picker, so it needs to
  // be reachable from here.
  const room =
    options.some((one) => one.type === "area") && widget.options?.area
      ? areas.find((one) => one.id === widget.options.area)
      : null;

  // An entity already doing one of the band's jobs is not offered to the list as
  // well: it describes the room rather than being a thing in it, and counting a
  // thermostat among the plugs is how the old arrangement went wrong.
  const takenByBand = ROOM_ROLES.map((role) => widget.options?.[role.key]).filter(Boolean);

  return (
    <aside className="inspector open">
      <div className="inspector-head">
        <h2>{type?.label || widget.type}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="inspector-meta">
        {widget.x}, {widget.y} · {size.width}×{size.height}
      </div>

      {/* Only for widgets that offer more than one; the specials have none.
          A div rather than a label, though it is styled as one: a <label>
          wrapping several buttons hands every one of them the *others'* text as
          its accessible name, so "Small" announces as the row's other sizes.
          Caught by a WebKit pass, where getByRole could not find any of them. */}
      {type?.sizes?.length > 1 && (
        <div className="field-block">
          <span>Size</span>
          <div className="size-picker">
            {type.sizes.map((option) => (
              <button
                key={option.id}
                className={
                  (widget.size || type.sizes[0].id) === option.id ? "chip active" : "chip"
                }
                onClick={() => onSetSize(widget.id, option.id)}
              >
                {option.label}
                {/* A self-sizing variant has no cell count worth showing */}
                {option.cols > 0 && option.rows > 0 && (
                  <small>
                    {option.cols}×{option.rows}
                  </small>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {options.map((option) => (
        <label key={option.key}>
          <span>{option.label}</span>
          <Option
            option={option}
            widget={widget}
            value={widget.options?.[option.key]}
            entities={entities}
            devices={devices}
            areas={areas}
            uploads={uploads}
            capacity={capacity}
            onChange={(next) => onSetOption(widget.id, option.key, next)}
            onChangeMany={(patch) => onSetOptions(widget.id, patch)}
          />
        </label>
      ))}

      {/* The room's counted list, after the readings rather than among them.
          The band's entities are each one field; this is a list, and it is what
          the buckets tally -- the lights, plugs, media and openings. */}
      {room && (
        <div className="field-block">
          <span>Things in the room</span>
          {room.entities.length > 0 ? (
            <DeviceEntities
              available={room.entities.filter(
                (one) => !takenByBand.includes(one.entity_id)
              )}
              chosen={widget.options?.entities}
              capacity={capacity}
              onChange={(next) => onSetOption(widget.id, "entities", next)}
            />
          ) : (
            <p className="hint">This room has nothing else in it.</p>
          )}
        </div>
      )}

      {options.length === 0 && <p className="hint">This widget has no options.</p>}

      {/* Which of two overlapping widgets the panel draws on top. It is the
          layout's order, so the canvas shows the same answer the device will.
          Shown only where there is something to be in front of. */}
      {layerCount > 1 && (
        <div className="field-block">
          <span>
            Layer <small className="layer-count">{layer + 1} of {layerCount}</small>
          </span>
          <div className="layer-picker">
            {LAYER_MOVES.map((move) => (
              <button
                key={move.id}
                className="chip"
                title={move.title}
                disabled={
                  layer < 0 ||
                  (["back", "backward"].includes(move.id) ? layer === 0 : layer === layerCount - 1)
                }
                onClick={() => onSetLayer(widget.id, move.id)}
              >
                {move.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="inspector-actions">
        <button onClick={() => onDuplicate(widget.id)}>Duplicate</button>
        <button className="danger" onClick={() => onRemove(widget.id)}>
          Remove
        </button>
      </div>
    </aside>
  );
}
