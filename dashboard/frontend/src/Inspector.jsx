import EntityPicker from "./EntityPicker.jsx";
import DevicePicker, { MAX_DEVICE_ENTITIES } from "./DevicePicker.jsx";
import { imagePreviewUrl } from "./api.js";
import { widgetSize, widgetType } from "./layout.js";

function Option({ option, widget, value, entities, devices, uploads, onChange, onChangeMany }) {
  // Picking a device sets three things at once, which is why this one option
  // reaches for onChangeMany: the id, so it can be re-resolved later; the
  // resolved entity list, which is what the panel actually renders; and the
  // name, prefilled because a device already has a good one and typing it again
  // is the sort of thing that makes an editor tiring.
  if (option.type === "device") {
    return (
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
  entities,
  devices,
  uploads,
  onSetOption,
  onSetOptions,
  onSetSize,
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
  const size = widgetSize(manifest, widget);

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

      {/* Only for widgets that offer more than one; the specials have none */}
      {type?.sizes?.length > 1 && (
        <label>
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
        </label>
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
            uploads={uploads}
            onChange={(next) => onSetOption(widget.id, option.key, next)}
            onChangeMany={(patch) => onSetOptions(widget.id, patch)}
          />
        </label>
      ))}

      {options.length === 0 && <p className="hint">This widget has no options.</p>}

      <button className="danger" onClick={() => onRemove(widget.id)}>
        Remove widget
      </button>
    </aside>
  );
}
