import { Hint } from "./Popover.jsx";

// The one shape every setting takes: a name, at most a line saying what the
// current choice means, the ⓘ for the why, and the control.
//
// The Device screen used to give each setting a card of its own, a control in
// whatever shape its author chose -- radio rows, pills, picture tiles, a
// segment -- and a paragraph or two underneath. Six cards of different heights
// left holes in the grid, and five kinds of control for the same kind of
// choice made each one something to read before it could be used. Now a
// choice between a few values is always a segment and on/off always a switch.

export function SettingsCard({ title, wide = false, children }) {
  return (
    <section className={wide ? "card settings-card span-all" : "card settings-card"} aria-label={title}>
      {title && <h3 className="settings-card-title">{title}</h3>}
      {children}
    </section>
  );
}

// `stacked` puts the control under the text rather than beside it, for the
// ones too wide to share a line -- which on a phone is most segments.
export function Setting({ title, hint, note, control, stacked = false, children }) {
  return (
    <div className={stacked ? "setting stacked" : "setting"}>
      <div className="setting-text">
        <div className="setting-title">
          {title}
          {hint && <Hint label={`About ${String(title).toLowerCase()}`}>{hint}</Hint>}
        </div>
        {note && <div className="setting-note">{note}</div>}
      </div>
      {control && <div className="setting-control">{control}</div>}
      {children}
    </div>
  );
}

// A choice between a few values. A group rather than a <label>: a label
// wrapping several buttons hands each of them the others' text as its
// accessible name, which has been fixed in this editor three times.
export function Segmented({ label, value, options, onChange }) {
  return (
    <div className="seg setting-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          className={option.value === value ? "active" : undefined}
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
          title={option.title}
          disabled={option.disabled}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ label, checked, onChange }) {
  return (
    <label className="switch">
      <span className="sr-only">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
