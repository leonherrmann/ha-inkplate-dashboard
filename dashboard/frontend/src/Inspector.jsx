import { useEffect, useState } from "react";

import EntityPicker from "./EntityPicker.jsx";
import DevicePicker, { MAX_DEVICE_ENTITIES } from "./DevicePicker.jsx";
import AreaPicker, { MAX_ROOM_ENTITIES } from "./AreaPicker.jsx";
import DeviceEntities from "./DeviceEntities.jsx";
import Sheet, { SheetBody, SheetFoot, useNarrow, HALF, PEEK } from "./Sheet.jsx";
import { imagePreviewUrl } from "./api.js";
import { LAYER_MOVES, widgetSize, widgetType } from "./layout.js";
import { categoryLabel, categoryTone, optionValues } from "./format.js";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  DuplicateIcon,
  HomeIcon,
  TrashIcon,
} from "./Icons.jsx";

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

// manifest, because an option's list may live in the manifest rather than on
// the option -- see optionValues. Nothing else here reads it.

// --- options big enough to be a screen of their own --------------------------
//
// The sheet's field list is as long as the widget has options, and the room
// card has twelve. Scrolling past ten controls to reach the eleventh is the
// cost of showing every one of them expanded; on a phone that is most of the
// screen spent on fields nobody is looking at.
//
// So the big ones become a row -- label, the value they are set to, a chevron
// -- and open on a second screen inside the sheet. "Big" means the control is
// taller than a line or its list is longer than a glance:
//
//   icon, image, album   selects of every icon the firmware carries, every
//                        picture uploaded, every album configured
//   text                 only the multi-line kind. A name and a paragraph are
//                        both "text"; which is which is the firmware's to say,
//                        since it is the widget that decides whether a newline
//                        means anything, and it says so with `multiline`. A
//                        name behind a second screen would be the most-edited
//                        field in the editor put one tap further away.
//   choice               only past a handful of values; a two-value choice is
//                        smaller as a select than as a row that opens a screen
//
// Not entity, device or area: those are already one row that opens a picker
// over the whole screen, which is this pattern arrived at earlier by another
// route. Turning them into a row that opens a screen that holds a row that
// opens a picker would be one tap deeper for nothing.
const SCREEN_TYPES = ["icon", "image", "album"];
const CHOICE_LIMIT = 5;

// The room card's counted list is not one of the manifest's options -- it is
// worked out here from the area -- but it is the longest thing in the sheet by
// some way: every light, plug, speaker and door in the room, each a row with a
// tick and two arrows. It gets a screen under a key of its own.
const ROOM_LIST = "__room_entities";

function wantsScreen(option, manifest) {
  if (SCREEN_TYPES.includes(option.type)) return true;
  if (option.type === "text") return Boolean(option.multiline);
  if (option.type !== "choice") return false;
  return optionValues(manifest, option).length > CHOICE_LIMIT;
}

// What the row says the option is set to, so the list can be read without
// opening anything.
function valueSummary(option, value, { albums, uploads }) {
  const raw = value === undefined || value === null ? "" : String(value);
  if (!raw) return option.type === "text" ? "Empty" : "Default";

  if (option.type === "album") {
    return (albums || []).find((one) => one.id === raw)?.name || raw;
  }
  if (option.type === "image") {
    const found = (uploads || []).find((one) => one.name === raw);
    return found ? `${found.name} (${found.width}×${found.height})` : raw;
  }
  if (option.type === "icon") {
    // The filter is a prefix every name in the list shares -- "rooms_" -- and
    // repeating it in a summary says nothing.
    return option.filter && raw.startsWith(option.filter)
      ? raw.slice(option.filter.length).replace(/_/g, " ")
      : raw.replace(/_/g, " ");
  }
  if (option.type === "text") {
    // One line: a text widget's value can be a paragraph, and the row is a
    // summary of it rather than a preview.
    const firstLine = raw.split("\n")[0];
    return firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine;
  }
  return raw.replace(/_/g, " ");
}


// The control a big option gets once it has a screen to itself.
//
// A list of rows rather than the select it is in the field list. A select of
// three hundred icon names is a wheel on a phone and a column taller than the
// window on a desktop, and neither can be searched -- which is the only way to
// find "rooms_shower" among them without reading the lot.
//
// The search field appears only past a dozen values: below that it is a box
// asking you to type in order to see what you could already see.
function ScreenList({ option, values, value, onChange, uploads }) {
  const [query, setQuery] = useState("");

  const label = (one) => {
    if (option.type === "icon" && option.filter && one.startsWith(option.filter)) {
      return one.slice(option.filter.length).replace(/_/g, " ");
    }
    return String(one).replace(/_/g, " ");
  };

  const terms = query.trim().toLowerCase();
  const shown = terms
    ? values.filter((one) => `${one} ${label(one)}`.toLowerCase().includes(terms))
    : values;

  // What the firmware will draw, for the one option type where the add-on has
  // the picture: an uploaded image is dithered here, so the row can show
  // exactly what goes on the panel.
  const preview = (one) =>
    option.type === "image" && (uploads || []).some((image) => image.name === one)
      ? imagePreviewUrl(one)
      : null;

  return (
    <>
      {values.length > 12 && (
        <label className="option-search">
          <span className="sr-only">Search {option.label}</span>
          <input
            type="search"
            value={query}
            placeholder={`Search ${values.length} options`}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}

      <div className="option-list" role="listbox" aria-label={option.label}>
        {/* Clearing is a choice like any other, and the first one: it is what
            the widget was set to before anybody opened this. */}
        <button
          type="button"
          role="option"
          aria-selected={!value}
          className={!value ? "option-item selected" : "option-item"}
          onClick={() => onChange("")}
        >
          {option.type === "album" || option.type === "image" ? "None" : "Default"}
        </button>

        {shown.map((one) => (
          <button
            key={one}
            type="button"
            role="option"
            aria-selected={one === value}
            className={one === value ? "option-item selected" : "option-item"}
            onClick={() => onChange(one)}
          >
            {preview(one) && <img src={preview(one)} alt="" className="option-item-shot" />}
            <span>{label(one)}</span>
          </button>
        ))}

        {shown.length === 0 && <p className="hint">Nothing matches “{query}”.</p>}
      </div>
    </>
  );
}

function Option({ option, manifest, widget, value, entities, devices, areas, uploads, albums, capacity, onChange, onChangeMany }) {
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
        {optionValues(manifest, option).map((choice) => (
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

  // The one option type whose values the firmware does not know. Every other
  // list here comes from the manifest -- the icons compiled in, the choices the
  // firmware accepts -- but albums are configured in the Images tab and the
  // panel only ever sees their pictures, so the list comes from our own API.
  if (option.type === "album") {
    return (
      <>
        <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
          <option value="">— none —</option>
          {(albums || []).map((album) => (
            <option key={album.id} value={album.id}>
              {`${album.name} (${album.rendered} ready)`}
            </option>
          ))}
        </select>
        {albums?.length === 0 && (
          <p className="hint">
            No albums yet. Add one in the Images tab — a photo widget shows an album
            rather than a picture, so there is nothing to choose until there is one.
          </p>
        )}
      </>
    );
  }

  // The firmware ships the icon names it can resolve, so this cannot produce
  // something it will fail to draw.
  if (option.type === "icon") {
    return (
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">— default —</option>
        {optionValues(manifest, option).map((name) => (
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
    const builtIn = optionValues(manifest, option);
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
  albums,
  layer,
  layerCount,
  dragging,
  onSetOption,
  onSetOptions,
  onSetSize,
  onSetLayer,
  onDuplicate,
  onRemove,
  onClose,
}) {
  // Below the tab bar's breakpoint the options are a sheet over the canvas
  // rather than a column beside it, and the sheet owns how tall it stands.
  // Held here rather than in App because nothing else has any use for it.
  const narrow = useNarrow();
  const [detent, setDetent] = useState(PEEK);

  // Which option has the sheet to itself, by key, or null for the field list.
  // Only ever set on a phone: the desktop inspector is a column that scrolls
  // beside the canvas, where a long list costs a scroll rather than a screen.
  const [screen, setScreen] = useState(null);

  // Selecting a different widget starts the sheet low again. The form is about
  // the widget, so carrying its height across a change of subject would open a
  // full-height sheet over a canvas the user was still choosing from.
  useEffect(() => {
    setDetent(PEEK);
    setScreen(null);
  }, [widget?.id]);

  // Collapsing the sheet leaves it on the field list. Coming back to a sheet
  // still showing one option, with no memory of having opened it, reads as the
  // editor having lost the rest of them.
  useEffect(() => {
    if (detent === PEEK) setScreen(null);
  }, [detent]);

  if (!widget) {
    // Nothing selected is not worth a sheet on a phone -- it would be a
    // permanent strip across the bottom saying only that it is empty. The
    // canvas says the same thing by having nothing outlined on it.
    if (narrow) return null;
    return (
      <aside className="inspector">
        <div className="eyebrow">Options</div>
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

  // What kind of thing this is, in the category's own words
  const group = categoryLabel(manifest, type?.category);

  // The option the sheet is showing on its own, if it is showing one. Looked up
  // rather than stored, so that a widget whose options changed under it -- a new
  // firmware, a different size -- cannot leave a screen open on an option that
  // is no longer offered.
  const screenOption = screen ? options.find((one) => one.key === screen) : null;

  // The values that option offers, or null for one that is not a list. Albums
  // are the add-on's own -- the panel only ever sees their pictures -- and
  // images come from two places, so neither is simply the manifest's.
  const screenValues = !screenOption
    ? null
    : screenOption.type === "album"
      ? (albums || []).map((one) => one.id)
      : screenOption.type === "image"
        ? [
            ...(uploads || []).map((one) => one.name),
            ...optionValues(manifest, screenOption).map((one) => one.name || one),
          ]
        : ["icon", "choice"].includes(screenOption.type)
          ? optionValues(manifest, screenOption)
          : null;

  // The list, built once: the field list and the screen render the same thing.
  const roomList = !room ? null : room.entities.length > 0 ? (
    <DeviceEntities
      available={room.entities.filter((one) => !takenByBand.includes(one.entity_id))}
      chosen={widget.options?.entities}
      capacity={capacity}
      onChange={(next) => onSetOption(widget.id, "entities", next)}
    />
  ) : (
    <p className="hint">This room has nothing else in it.</p>
  );

  // How many of the room's things the card is showing, against how many the
  // chosen size can draw -- which is the question the row is asked.
  const roomListSummary = !room
    ? ""
    : room.entities.length === 0
      ? "Nothing in it"
      : `${(widget.options?.entities || []).length || room.entities.length} of ${room.entities.length}`;

  const title = widget.options?.name || type?.label || widget.type;
  const tone = categoryTone(type?.category);

  // The summary line. Cells where the chosen size has them, because that is
  // what the user picked and what the panel's grid is counted in; pixels only
  // for the self-sizing widgets, which have no cell count to give.
  const footprint =
    chosenSize?.cols > 0 && chosenSize?.rows > 0
      ? `${chosenSize.cols}×${chosenSize.rows}`
      : `${size.width}×${size.height}`;

  const head = (
    <div className="inspector-head">
      {/* The accent is the widget's category, which the manifest names and
          orders, so a category added in a later firmware arrives with a tone
          rather than with none. */}
      <span className={`token lg ${tone}`}>
        <HomeIcon size={19} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="inspector-meta">
          {group ? `${group} · ` : ""}
          {type?.label || widget.type}
        </div>
        {/* The name the user gave it leads: on a page of six room cards
            "Room" is the one thing that does not tell them apart. */}
        <h2>{title}</h2>
      </div>
      <button className="icon-button plain" onClick={onClose} aria-label="Close">
        ×
      </button>
    </div>
  );

  const fields = (
    <>
      <div className="hint">
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
                {/* A self-sizing variant has no cell count worth showing, so
                    it falls back to the name the firmware gave it. */}
                {option.cols > 0 && option.rows > 0
                  ? `${option.cols}×${option.rows}`
                  : option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {options.map((option) => {
        // An option whose control is a *button* cannot sit in a <label>. A
        // control inside one takes its accessible name from the label, so the
        // entity trigger announced as "Light" -- the field's name -- rather
        // than as the entity it is showing, and a screen reader had no way to
        // hear what was chosen. Safari also forwards a click anywhere in a
        // label to the first labelable descendant, which is the same trap the
        // pickers are portalled out of the tree for.
        //
        // This is the third time this defect has been fixed in this file: the
        // size picker and the layer buttons already moved to .field-block for
        // it. The rule is simply that a label may only wrap one real form
        // control, and these three option types wrap a button instead.
        const isButton = ["entity", "device", "area"].includes(option.type);

        // On a phone the big ones are a row that opens a screen -- see
        // wantsScreen. A button, not a label: it opens something rather than
        // naming a control.
        if (narrow && wantsScreen(option, manifest)) {
          return (
            <button
              key={option.key}
              type="button"
              className="option-row"
              onClick={() => setScreen(option.key)}
            >
              <span className="option-row-label">{option.label}</span>
              <span className="option-row-value">
                {valueSummary(option, widget.options?.[option.key], { albums, uploads })}
              </span>
              <ChevronRight size={15} />
            </button>
          );
        }

        const Wrapper = isButton ? "div" : "label";
        return (
          <Wrapper
            key={option.key}
            className={isButton ? "field-block" : undefined}
            {...(isButton ? { role: "group", "aria-label": option.label } : {})}
          >
            <span>{option.label}</span>
            <Option
              option={option}
              manifest={manifest}
              widget={widget}
              value={widget.options?.[option.key]}
              entities={entities}
              devices={devices}
              areas={areas}
              uploads={uploads}
              albums={albums}
              capacity={capacity}
              onChange={(next) => onSetOption(widget.id, option.key, next)}
              onChangeMany={(patch) => onSetOptions(widget.id, patch)}
            />
          </Wrapper>
        );
      })}

      {/* The room's counted list, after the readings rather than among them.
          The band's entities are each one field; this is a list, and it is what
          the buckets tally -- the lights, plugs, media and openings. */}
      {room &&
        (narrow ? (
          // On a phone it is a row like the big options above it. It is longer
          // than any of them -- a room with a dozen things in it is a dozen
          // rows of tick and arrows -- so if anything earns a screen, this does.
          <button
            type="button"
            className="option-row"
            onClick={() => setScreen(ROOM_LIST)}
          >
            <span className="option-row-label">Things in the room</span>
            <span className="option-row-value">{roomListSummary}</span>
            <ChevronRight size={15} />
          </button>
        ) : (
          <div className="field-block">
            <span>Things in the room</span>
            {roomList}
          </div>
        ))}

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

      {/* Duplicate and Remove were here as well until the toolbar grew the
          design's four selection actions. Two buttons that do the same thing on
          the same widget, one on each side of the canvas, is a question the
          reader has to answer ("do these differ?") before they can use either.
          The toolbar keeps them, because that is where 1a draws them and it is
          the side the selection is on. */}
    </>
  );

  // On a phone, design 1b: the same head and the same fields, in a sheet that
  // rises over the canvas instead of a column that only exists below it.
  if (narrow) {
    return (
      <Sheet detent={detent} onDetent={setDetent} label={`${title} options`} retracted={dragging}>
        {detent === PEEK ? (
          // What is selected, and the way in. The whole row opens the sheet
          // rather than only the chevron -- at this height the row *is* the
          // control, and a 32px target for the one thing there is to do here
          // would be the smallest tap target on the screen.
          <button type="button" className="sheet-summary" onClick={() => setDetent(HALF)}>
            <span className={`token lg ${tone}`}>
              <HomeIcon size={19} />
            </span>
            <span className="sheet-summary-text">
              <b>{title}</b>
              <small>
                {type?.label || widget.type} · {footprint} · {widget.x}, {widget.y}
              </small>
            </span>
            <span className="sheet-summary-more" aria-hidden="true">
              <ChevronUp size={15} />
            </span>
          </button>
        ) : screen ? (
          // One option, with the sheet to itself. The back button is the whole
          // way out: there is nothing to confirm, because every control here
          // writes as it is changed exactly as it does in the list.
          <>
            <div className="inspector-head">
              <button
                className="icon-button plain"
                onClick={() => setScreen(null)}
                aria-label={`Back to ${title} options`}
              >
                <ChevronLeft size={15} />
              </button>
              <div style={{ minWidth: 0 }}>
                <div className="inspector-meta">{title}</div>
                <h2>{screen === ROOM_LIST ? "Things in the room" : screenOption?.label || "Option"}</h2>
              </div>
              <button className="icon-button plain" onClick={onClose} aria-label="Close">
                ×
              </button>
            </div>
            <SheetBody>
              {screen === ROOM_LIST && <div className="option-screen">{roomList}</div>}
              {screenOption && (
                <div className="option-screen">
                  {/* A list of values gets the list control; anything else --
                      the text widget's paragraph -- gets the same control it
                      has in the field list, with the room to be read. */}
                  {screenValues ? (
                    <ScreenList
                      option={screenOption}
                      values={screenValues}
                      value={widget.options?.[screenOption.key] || ""}
                      uploads={uploads}
                      onChange={(next) => onSetOption(widget.id, screenOption.key, next)}
                    />
                  ) : (
                  <Option
                    option={screenOption}
                    manifest={manifest}
                    widget={widget}
                    value={widget.options?.[screenOption.key]}
                    entities={entities}
                    devices={devices}
                    areas={areas}
                    uploads={uploads}
                    albums={albums}
                    capacity={capacity}
                    onChange={(next) => onSetOption(widget.id, screenOption.key, next)}
                    onChangeMany={(patch) => onSetOptions(widget.id, patch)}
                  />
                  )}
                </div>
              )}
            </SheetBody>
          </>
        ) : (
          <>
            {head}
            <SheetBody>{fields}</SheetBody>
            {/* The design puts these in the sheet's foot on a phone, not in the
                toolbar: the toolbar is above the canvas and therefore off
                screen whenever the sheet is open, which is exactly when you
                want them. */}
            <SheetFoot>
              <button className="sheet-action" onClick={() => onDuplicate?.(widget.id)}>
                <DuplicateIcon size={15} />
                Duplicate
              </button>
              <button className="sheet-action danger" onClick={() => onRemove?.(widget.id)}>
                <TrashIcon size={15} />
                Delete
              </button>
            </SheetFoot>
          </>
        )}
      </Sheet>
    );
  }

  return (
    <aside className="inspector open">
      {head}
      {fields}
    </aside>
  );
}
