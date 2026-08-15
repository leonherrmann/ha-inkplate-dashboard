import EntityPicker from "./EntityPicker.jsx";
import { widgetSize, widgetType } from "./layout.js";

function Option({ option, value, entities, onChange }) {
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

  // Image values carry their pixel size, which is also the widget's footprint
  if (option.type === "image") {
    return (
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">— none —</option>
        {(option.values || []).map((image) => (
          <option key={image.name} value={image.name}>
            {(option.filter && image.name.startsWith(option.filter)
              ? image.name.slice(option.filter.length)
              : image.name) + ` (${image.width}×${image.height})`}
          </option>
        ))}
      </select>
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
  onSetOption,
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
                <small>
                  {option.cols}×{option.rows}
                </small>
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
            value={widget.options?.[option.key]}
            entities={entities}
            onChange={(next) => onSetOption(widget.id, option.key, next)}
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
