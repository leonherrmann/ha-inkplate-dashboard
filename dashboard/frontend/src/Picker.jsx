import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { InfoIcon, WarningIcon } from "./Icons.jsx";

// The shell every picker in the editor shares: entities, devices, rooms and
// widgets. They were four hand-rolled modals that had drifted -- three had an
// area filter and one did not, two closed on Escape and the widget list was not
// a modal at all -- so the differences between them read as meaning rather than
// as accident.
//
// Rendered into document.body rather than where it sits in the tree. The
// Inspector wraps every option in a <label>, and Safari treats a click anywhere
// inside a label as a label activation, forwarding a synthetic click to the
// first labelable descendant -- which is the trigger button that opened the
// picker. Picking something therefore closed the sheet and immediately reopened
// it, so it looked as though it never closed while the choice had in fact been
// made. The spec says label activation should do nothing for clicks on
// interactive content inside it and Chromium obeys that, which is why this only
// ever appeared in Safari.

export function Picker({ title, onClose, children, footer }) {
  const sheet = useRef(null);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="picker-backdrop" onClick={onClose}>
      <div
        className="picker"
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="picker-head">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
        {footer && <div className="picker-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// The search field. Autofocused on a pointer device only: on a phone it would
// raise the keyboard over the very tiles the stepped browser exists to offer,
// so a thumb would have to dismiss it before it could tap anything.
export function PickerSearch({ value, onChange, placeholder }) {
  const focus = typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches;
  return (
    <input
      autoFocus={focus}
      className="picker-search"
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  );
}

// Where you are, and the way back. Every crumb but the last is a button, so any
// step can be returned to directly rather than only one at a time.
export function PickerCrumbs({ trail }) {
  if (trail.length < 2) return null;
  return (
    <nav className="picker-crumbs" aria-label="Steps">
      {trail.map((crumb, index) => {
        const last = index === trail.length - 1;
        return (
          <span key={crumb.label + index}>
            {index > 0 && <i aria-hidden="true">›</i>}
            {last ? (
              <b>{crumb.label}</b>
            ) : (
              <button className="picker-crumb" onClick={crumb.onClick}>
                {crumb.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

// A step's choices, as tiles: a label, what it holds, and how many. Sized by
// the grid rather than by the count, so one room and twenty rooms look like the
// same kind of question.
export function PickerTiles({ items, onPick }) {
  return (
    <div className="picker-tiles">
      {items.map((item) => (
        <button key={item.id} className="picker-tile" onClick={() => onPick(item)}>
          {item.glyph && (
            <span className="picker-tile-glyph" aria-hidden="true">
              {item.glyph}
            </span>
          )}
          <span className="picker-tile-label">{item.label}</span>
          <span className="picker-tile-count">{item.count}</span>
        </button>
      ))}
    </div>
  );
}

// The final list, once the steps have narrowed it. `meta` is the second line --
// the entity id, the area, whatever tells two similarly named things apart.
export function PickerRows({ rows, value, onPick, empty = "Nothing matches." }) {
  return (
    <div className="picker-list">
      {rows.map((row) => (
        <button
          key={row.id}
          className={row.id === value ? "picker-row active" : "picker-row"}
          onClick={() => onPick(row)}
        >
          <span className="picker-row-name">{row.label}</span>
          {row.meta && <span className="picker-row-meta">{row.meta}</span>}
        </button>
      ))}
      {rows.length === 0 && <p className="hint picker-empty">{empty}</p>}
    </div>
  );
}

// What an option will and will not accept -- design 1d. An option pinned to one
// domain silently drops everything else, and without this the list simply looks
// short: "where is my sensor" has no answer on screen.
export function PickerLimit({ domain }) {
  if (!domain) return null;
  return (
    <p className="picker-limit">
      <InfoIcon size={13} width={2} />
      <span>
        This option only accepts the <b>{domain}</b> domain
      </span>
    </p>
  );
}

// Every list in the editor comes from Home Assistant, and with no credentials
// they all come back empty at once -- which reads as "this room has nothing in
// it" rather than "nothing has been fetched". The design gives it a card
// because the pickers are not broken and should not look it.
export function PickerNoLink() {
  return (
    <div className="note danger">
      <div className="note-head">
        <WarningIcon size={16} />
        No Home Assistant link
      </div>
      <p>
        Entity, device and area lists come back empty because the add-on has no
        credentials. The pickers are not broken — there is nothing to show yet.
      </p>
    </div>
  );
}
