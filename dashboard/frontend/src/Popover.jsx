import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ChevronDown } from "./Icons.jsx";

// A small surface anchored to a button: the ⓘ explanations and the toolbar's
// menus.
//
// Portalled to document.body and placed with fixed coordinates, for the same
// reason the pickers are: cards clip, the canvas well clips, and a popover
// that opened inside one was cut off at its edge. Placed below the anchor, or
// above it when the window runs out, and never past either side.
export function Popover({ anchor, onClose, className = "", role, id, label, children }) {
  const box = useRef(null);
  const [place, setPlace] = useState(null);

  useLayoutEffect(() => {
    const measure = () => {
      const at = anchor.current?.getBoundingClientRect();
      const own = box.current?.getBoundingClientRect();
      if (!at || !own) return;
      const room = 8;
      const below = at.bottom + 6;
      const top =
        below + own.height > window.innerHeight - room && at.top - 6 - own.height > room
          ? at.top - 6 - own.height
          : below;
      const centred = at.left + at.width / 2 - own.width / 2;
      const left = Math.min(Math.max(room, centred), window.innerWidth - own.width - room);
      setPlace({ top, left });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [anchor]);

  useEffect(() => {
    const onPointer = (event) => {
      if (box.current?.contains(event.target) || anchor.current?.contains(event.target)) return;
      onClose();
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
      anchor.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={box}
      id={id}
      role={role}
      aria-label={label}
      className={`popover ${className}`}
      // Measured hidden first, so it never flashes at the corner of the screen
      style={place ? { top: place.top, left: place.left } : { top: 0, left: 0, visibility: "hidden" }}
    >
      {children}
    </div>,
    document.body
  );
}

const canHover = () =>
  typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;

// The ⓘ beside a heading. What used to be a paragraph under every control is
// here now: the control says what it does in a line, and this holds the why.
// A tap opens it on a phone; a pointer only has to rest on it.
export function Hint({ children, label = "More about this" }) {
  const anchor = useRef(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();

  const close = () => {
    setOpen(false);
    setPinned(false);
  };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="hint-button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(event) => {
          // Inside a row that is itself a button, a tap here is not a tap on
          // the row
          event.stopPropagation();
          event.preventDefault();
          if (pinned) close();
          else {
            setOpen(true);
            setPinned(true);
          }
        }}
        onMouseEnter={() => canHover() && setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => canHover() && setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
      >
        i
      </button>
      {open && (
        <Popover anchor={anchor} onClose={close} className="hint-pop" role="tooltip" id={id}>
          {children}
        </Popover>
      )}
    </>
  );
}

// A button that opens a panel of controls: the toolbar's View menu and the
// edit screen's ⋯. The children are a function of close, for the entries that
// should put the menu away once chosen.
export function Menu({ label, icon, text, className = "", buttonClassName = "", children, caret = true }) {
  const anchor = useRef(null);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={`menu-button ${buttonClassName}`}
        aria-label={text ? undefined : label}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((now) => !now)}
      >
        {icon}
        {text && <span>{text}</span>}
        {text && caret && <ChevronDown size={13} />}
      </button>
      {open && (
        <Popover anchor={anchor} onClose={close} className={`menu-pop ${className}`} role="dialog" label={label}>
          {typeof children === "function" ? children(close) : children}
        </Popover>
      )}
    </>
  );
}

// One entry in a menu that does something rather than setting something
export function MenuItem({ icon, children, onClick, danger, disabled, hint }) {
  return (
    <button
      type="button"
      className={danger ? "menu-item danger" : "menu-item"}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span>{children}</span>
      {hint && <small>{hint}</small>}
    </button>
  );
}
