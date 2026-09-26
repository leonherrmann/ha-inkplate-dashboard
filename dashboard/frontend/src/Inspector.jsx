import { useEffect, useState } from "react";

import EntityPicker from "./EntityPicker.jsx";
import DevicePicker, { MAX_DEVICE_ENTITIES } from "./DevicePicker.jsx";
import AreaPicker, { MAX_ROOM_ENTITIES } from "./AreaPicker.jsx";
import DeviceEntities from "./DeviceEntities.jsx";
import { IconField, IconGlyph, IconGrid } from "./IconGrid.jsx";
import { useNarrow } from "./useNarrow.js";
import { Menu, MenuItem } from "./Popover.jsx";
import { imagePreviewUrl } from "./api.js";
import { sizesOn, widgetType } from "./layout.js";
import { categoryLabel, categoryTone, optionValues } from "./format.js";
import {
  BackIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DuplicateIcon,
  FrontIcon,
  HomeIcon,
  MoreIcon,
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
// The field list is as long as the widget has options, and the room card has
// twelve. Scrolling past ten controls to reach the eleventh is the
// cost of showing every one of them expanded; on a phone that is most of the
// screen spent on fields nobody is looking at.
//
// So the big ones become a row -- label, the value they are set to, a chevron
// -- and open on a screen of their own. "Big" means the control is
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
// worked out here from the area -- but it is the longest thing in the options by
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


// The control a big option gets once it has a screen to itself: images and
// albums, which are lists of names the add-on holds.
//
// A list of rows rather than a select. A select of a hundred uploads is a wheel
// on a phone and a column taller than the window on a desktop, and neither can
// be searched -- which is the only way to find one without reading the lot.
//
// Icons went the same way and then further: they are pictures, so they get a
// grid of the drawings instead. See IconGrid.jsx.
//
// The search field appears only past a dozen values: below that it is a box
// asking you to type in order to see what you could already see.
function ScreenList({ option, values, value, onChange, uploads }) {
  const [query, setQuery] = useState("");

  const label = (one) => String(one).replace(/_/g, " ");

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

  // Newlines are meaningful to the text widget, so it needs a real textarea.
  // A card's name is "text" too, and wants one line -- the firmware says which
  // is which with `multiline`.
  if (option.type === "text" && option.multiline) {
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
          <option value="">None</option>
          {(albums || []).map((album) => (
            <option key={album.id} value={album.id}>
              {`${album.name} (${album.rendered} ready)`}
            </option>
          ))}
        </select>
        {albums?.length === 0 && (
          <p className="hint">No albums yet. Add one in the Images tab.</p>
        )}
      </>
    );
  }

  // The firmware ships the icon names it can resolve, so this cannot produce
  // something it will fail to draw. What it draws is shown rather than named --
  // see IconGrid.jsx.
  if (option.type === "icon") {
    return (
      <IconField
        option={option}
        values={optionValues(manifest, option)}
        value={value || ""}
        onChange={onChange}
      />
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
          <option value="">None</option>
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


// Options that change how often a widget redraws rather than what it shows.
// Every widget has one and nearly nobody changes it, so it waits behind
// "Advanced" instead of sitting in the middle of the list with a label longer
// than any other.
const ADVANCED_KEYS = ["update_interval"];

// What a widget is called in a heading: the name the user gave it, since on a
// page of six room cards "Room" is the one thing that does not tell them apart.
export function widgetTitle(manifest, widget) {
  const type = widgetType(manifest, widget);
  return widget?.options?.name || type?.label || widget?.type || "Widget";
}

// The head of the edit screen on a phone. Done in reach of the thumb that
// tapped the widget, and the things done *to* the widget rather than *with*
// it behind the ⋯, where a stray tap cannot delete anything.
export function EditHead({ widget, manifest, layer, layerCount, onDone, onFront, onBack, onDuplicate, onRemove }) {
  const type = widgetType(manifest, widget);
  const group = categoryLabel(manifest, type?.category);
  return (
    <div className="edit-head">
      <span className={`token ${categoryTone(type?.category)}`}>
        <HomeIcon size={16} />
      </span>
      <div className="edit-head-text">
        <small>{[group, type?.label || widget.type].filter(Boolean).join(" · ")}</small>
        <h2>{widgetTitle(manifest, widget)}</h2>
      </div>
      <Menu label="Widget actions" icon={<MoreIcon size={17} />} buttonClassName="icon-button">
        {(close) => (
          <>
            <MenuItem
              icon={<FrontIcon size={15} />}
              disabled={layer >= layerCount - 1}
              onClick={() => {
                close();
                onFront();
              }}
            >
              Bring to front
            </MenuItem>
            <MenuItem
              icon={<BackIcon size={15} />}
              disabled={layer <= 0}
              onClick={() => {
                close();
                onBack();
              }}
            >
              Send to back
            </MenuItem>
            <MenuItem
              icon={<DuplicateIcon size={15} />}
              onClick={() => {
                close();
                onDuplicate();
              }}
            >
              Duplicate
            </MenuItem>
            <MenuItem
              icon={<TrashIcon size={15} />}
              danger
              onClick={() => {
                close();
                onRemove();
              }}
            >
              Delete
            </MenuItem>
          </>
        )}
      </Menu>
      <button className="primary edit-done" onClick={onDone}>
        Done
      </button>
    </div>
  );
}

export default function Inspector({
  widget,
  manifest,
  grid,
  entities,
  devices,
  areas,
  uploads,
  albums,
  onSetOption,
  onSetOptions,
  onSetSize,
  onClose,
}) {
  // On a phone the fields are the page under a pinned canvas; on a desktop a
  // column beside it.
  const narrow = useNarrow();

  // Which option has the screen to itself, by key, or null for the field list.
  // Only ever set on a phone: the desktop column scrolls, where a long list
  // costs a scroll rather than a screen.
  const [screen, setScreen] = useState(null);

  // A different widget starts on its field list
  useEffect(() => {
    setScreen(null);
  }, [widget?.id]);

  // Opening or leaving an option starts it at the top, under the canvas,
  // rather than wherever the list had been scrolled to.
  useEffect(() => {
    if (narrow) window.scrollTo({ top: 0 });
  }, [screen, narrow]);

  if (!widget) {
    // On a phone there is no edit screen until something is selected
    if (narrow) return null;
    return (
      <aside className="inspector">
        <div className="eyebrow">Options</div>
        <p className="hint">Select a widget on the panel to edit it.</p>
      </aside>
    );
  }

  const type = widgetType(manifest, widget);
  // Full screen is never framed -- the firmware ignores a border there -- so
  // offering the choice would be a control that does nothing.
  const fullScreen = Boolean(type?.sizes?.find((one) => one.id === widget.size)?.full);
  const options = (type?.options || []).filter(
    (option) => !(fullScreen && option.key === "border")
  );
  const everyday = options.filter((option) => !ADVANCED_KEYS.includes(option.key));
  const advanced = options.filter((option) => ADVANCED_KEYS.includes(option.key));

  // How many entities the chosen size actually draws. The firmware publishes it
  // per size, because guessing from the cell count stopped being right the
  // moment the device card was relaid out as a bento.
  const chosenSize = type?.sizes?.find(
    (one) => one.id === (widget.size || type.sizes?.[0]?.id)
  );
  const capacity = chosenSize?.capacity || 0;

  // The room this card is set to, if it is a room card at all. Its counted list
  // is rendered below the options rather than beside the picker.
  const room =
    options.some((one) => one.type === "area") && widget.options?.area
      ? areas.find((one) => one.id === widget.options.area)
      : null;

  // An entity already doing one of the band's jobs is not offered to the list as
  // well: it describes the room rather than being a thing in it.
  const takenByBand = ROOM_ROLES.map((role) => widget.options?.[role.key]).filter(Boolean);

  // What kind of thing this is, in the category's own words
  const group = categoryLabel(manifest, type?.category);

  // The option on a screen of its own, if one is. Looked up rather than
  // stored, so a widget whose options changed under it cannot leave a screen
  // open on an option that is no longer offered.
  const screenOption = screen ? options.find((one) => one.key === screen) : null;

  // The values that option offers, or null for one that is not a list. Albums
  // are the add-on's own and images come from two places, so neither is simply
  // the manifest's.
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

  // How many of the room's things the card is showing, against how many there are
  const roomListSummary = !room
    ? ""
    : room.entities.length === 0
      ? "Nothing in it"
      : `${(widget.options?.entities || []).length || room.entities.length} of ${room.entities.length}`;

  const title = widgetTitle(manifest, widget);
  const tone = categoryTone(type?.category);

  // Only the sizes the shape being edited has room for. The manifest carries
  // both shapes' -- a 3x6 photo fits a panel on its side and nothing else.
  const offeredSizes = sizesOn(type, grid);

  const field = (option) => {
    // An option whose control is a *button* cannot sit in a <label>: a control
    // inside one takes its accessible name from the label, and Safari forwards
    // a click anywhere in a label to the first labelable descendant. A label
    // may only wrap one real form control; these three wrap a button.
    const isButton = ["entity", "device", "area"].includes(option.type);

    // On a phone the big ones are a row that opens a screen -- see wantsScreen
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
            {/* The icon beside its name: "shower" and "shield" are a great
                deal easier to tell apart as pictures. */}
            {option.type === "icon" && widget.options?.[option.key] && (
              <IconGlyph name={widget.options[option.key]} className="option-row-glyph" />
            )}
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
  };

  const fields = (
    <>
      {/* Only for widgets that offer more than one; the specials have none. A
          div rather than a label: a <label> wrapping several buttons hands every
          one of them the others' text as its accessible name. */}
      {offeredSizes.length > 1 && (
        <div className="field-block">
          <span>Size</span>
          <div className="size-picker">
            {offeredSizes.map((option) => (
              <button
                key={option.id}
                className={
                  (widget.size || type.sizes[0].id) === option.id ? "chip active" : "chip"
                }
                onClick={() => onSetSize(widget.id, option.id)}
              >
                {/* A self-sizing variant has no cell count worth showing, so it
                    falls back to the name the firmware gave it. */}
                {option.cols > 0 && option.rows > 0
                  ? `${option.cols}×${option.rows}`
                  : option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {everyday.map(field)}

      {/* The room's counted list, after the readings rather than among them:
          the band's entities are each one field, and this is a list. */}
      {room &&
        (narrow ? (
          <button type="button" className="option-row" onClick={() => setScreen(ROOM_LIST)}>
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

      {advanced.length > 0 && (
        <details className="advanced">
          <summary>
            <ChevronDown size={14} />
            Advanced
          </summary>
          <div className="advanced-body">{advanced.map(field)}</div>
        </details>
      )}
    </>
  );

  if (narrow) {
    if (screen) {
      // One option with the screen to itself. Back is the whole way out: every
      // control here writes as it is changed, exactly as in the list.
      return (
        <section className="edit-fields" aria-label={`${title} options`}>
          <button className="back-row" onClick={() => setScreen(null)}>
            <ChevronLeft size={15} />
            All options
          </button>
          <h3 className="edit-screen-title">
            {screen === ROOM_LIST ? "Things in the room" : screenOption?.label || "Option"}
          </h3>
          <div className="option-screen">
            {screen === ROOM_LIST && roomList}
            {screenOption &&
              (screenValues && screenOption.type === "icon" ? (
                <IconGrid
                  option={screenOption}
                  values={screenValues}
                  value={widget.options?.[screenOption.key] || ""}
                  onChange={(next) => onSetOption(widget.id, screenOption.key, next)}
                />
              ) : screenValues ? (
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
              ))}
          </div>
        </section>
      );
    }
    return (
      <section className="edit-fields" aria-label={`${title} options`}>
        {fields}
      </section>
    );
  }

  return (
    <aside className="inspector open">
      <div className="inspector-head">
        {/* The accent is the widget's category, which the manifest names and
            orders, so a category added in a later firmware arrives with a tone. */}
        <span className={`token lg ${tone}`}>
          <HomeIcon size={19} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="inspector-meta">
            {group ? `${group} · ` : ""}
            {type?.label || widget.type}
          </div>
          <h2>{title}</h2>
        </div>
        <button className="icon-button plain" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {fields}
    </aside>
  );
}
