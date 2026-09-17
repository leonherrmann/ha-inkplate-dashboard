import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The bottom sheet from design 1b. On a phone the widget's options were simply
// the last block of the edit page: to change a widget you tapped it on the
// canvas, then scrolled past the canvas and the page list to find the form, and
// the thing you were editing was off screen by the time you got there. The
// design answers that with a sheet that rises over the canvas at three heights,
// so the widget and its options are on screen at once.
//
// The three detents, and what each is for:
//
//   peek  a summary of what is selected, and nothing else. The canvas is
//         untouched, so the next widget is one tap away.
//   half  the form, with the canvas still visible above it -- the state you
//         edit in, because changing a size or an entity is worth watching.
//   full  the form at its tallest for a long option list. The canvas is
//         scrimmed down to a strip, and tapping the strip comes back to peek.
//
// Rendered into document.body, like Picker, for two reasons: fixed positioning
// inside a grid column that has scrolled loses its containing block (the same
// trap the tab bar hit), and the sheet has to be able to cover the tab bar at
// its full height.

export const PEEK = "peek";
export const HALF = "half";
export const FULL = "full";

const ORDER = [PEEK, HALF, FULL];

// How tall the sheet stands at each detent, in pixels of this viewport. peek is
// deliberately a guess rather than a measurement: it is only ever used to
// decide which detent a release is nearest, and the rendered height comes from
// the content.
function heights() {
  const vh = window.innerHeight;
  return {
    [PEEK]: 128,
    [HALF]: Math.round(vh * 0.58),
    [FULL]: Math.max(240, vh - 118),
  };
}

function nearest(height) {
  const targets = heights();
  return ORDER.reduce((best, detent) =>
    Math.abs(targets[detent] - height) < Math.abs(targets[best] - height) ? detent : best
  );
}

const step = (detent, by) => ORDER[Math.min(ORDER.length - 1, Math.max(0, ORDER.indexOf(detent) + by))];

// True while the viewport is narrow enough for the tab bar. The sheet is a
// phone shape; on a desktop the inspector is a column beside the canvas and
// this returns false, so nothing below is mounted at all.
export function useNarrow(query = "(max-width: 820px)") {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = (event) => setNarrow(event.matches);
    media.addEventListener("change", onChange);
    setNarrow(media.matches);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return narrow;
}

export default function Sheet({ detent, onDetent, label, retracted, children }) {
  const sheet = useRef(null);
  const drag = useRef(null);
  // The height under the finger, while there is a finger on the grabber. null
  // the rest of the time, which is what lets CSS own the resting heights. Kept
  // in a ref as well because the release has to read it, and a state updater is
  // not a place to decide anything -- React may call one twice.
  const [live, setLive] = useState(null);
  const liveHeight = useRef(null);

  const setHeight = (height) => {
    liveHeight.current = height;
    setLive(height);
  };

  const toggle = useCallback(
    () => onDetent(detent === PEEK ? HALF : PEEK),
    [detent, onDetent]
  );

  // The page underneath has to know a sheet is standing on it, or its last rows
  // and the toast sit behind one. A class on the document rather than a prop
  // threaded back up through App: the sheet is portalled out of the tree and
  // nothing in that tree is a useful place to hang this.
  useEffect(() => {
    document.documentElement.classList.add("sheet-open");
    return () => {
      document.documentElement.classList.remove("sheet-open");
      document.documentElement.removeAttribute("data-sheet");
    };
  }, []);

  // And how much of it the sheet is covering, so the page can reserve exactly
  // that and no more. --sheet-h is the stylesheet's single answer to it.
  useEffect(() => {
    document.documentElement.setAttribute("data-sheet", detent);
  }, [detent]);

  useEffect(() => {
    // Escape steps down rather than deselecting: the sheet is not a modal even
    // at full height, and losing the selection because you wanted the canvas
    // back is a surprise.
    //
    // Only when the sheet is the top layer, though. A picker opened from inside
    // it listens for Escape on window as well, and two window listeners cannot
    // stop each other -- so without this guard, dismissing a picker also
    // collapsed the sheet that opened it, and the option you had just come back
    // from choosing was off screen.
    const onKey = (event) => {
      if (event.key !== "Escape" || detent === PEEK) return;
      if (document.querySelector(".picker-backdrop")) return;
      onDetent(step(detent, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detent, onDetent]);

  // Raising the sheet brings the canvas to the top of the screen. The design
  // draws the widget being edited above the sheet at both of these heights, and
  // that only happens if the page is scrolled there -- otherwise the strip left
  // over shows whatever was already at the top, which on this screen is the
  // device card. Editing a widget you cannot see is the thing this sheet exists
  // to fix, so it is worth moving the page for.
  useEffect(() => {
    if (detent === PEEK) return;
    document.querySelector(".panel-outer")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [detent]);

  const onPointerDown = (event) => {
    // A secondary button is not a drag, and neither is a gesture that started
    // on the close button sitting in the same row.
    if (event.button !== 0) return;
    const box = sheet.current?.getBoundingClientRect();
    if (!box) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { y: event.clientY, height: box.height, moved: false };
  };

  const onPointerMove = (event) => {
    const from = drag.current;
    if (!from) return;
    const dy = from.y - event.clientY;
    if (Math.abs(dy) > 4) from.moved = true;
    if (!from.moved) return;

    // The form is not rendered at peek, so a pull from there would otherwise
    // grow an empty sheet and only fill it on release. Committing to half the
    // moment the pull is recognised puts the content under the finger instead;
    // the release still decides where it settles, and letting go early lands
    // back at peek because that is what the height is nearest.
    if (detent === PEEK && dy > 0) onDetent(HALF);

    const targets = heights();
    setHeight(Math.min(targets[FULL], Math.max(72, from.height + dy)));
  };

  const onPointerUp = () => {
    const from = drag.current;
    drag.current = null;
    if (!from) return;
    // A tap, not a drag. The grabber is the biggest target on the sheet, so it
    // toggles rather than doing nothing.
    if (!from.moved) {
      toggle();
      setHeight(null);
      return;
    }
    onDetent(nearest(liveHeight.current ?? from.height));
    setHeight(null);
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onDetent(step(detent, 1));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      onDetent(step(detent, -1));
    }
  };

  const className = [
    "sheet",
    `sheet-${detent}`,
    retracted ? "retracted" : "",
    live !== null ? "dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <>
      {/* Only at full height, where the sheet has taken the screen. At peek and
          half the canvas behind is meant to stay live -- tapping another widget
          while the form is open is how you move between them. */}
      {detent === FULL && !retracted && (
        <button
          type="button"
          className="sheet-scrim"
          onClick={() => onDetent(PEEK)}
          aria-label="Dismiss the options sheet"
        >
          <span className="sheet-scrim-hint">Tap here to dismiss</span>
        </button>
      )}

      <aside
        ref={sheet}
        className={className}
        style={live !== null ? { height: live } : undefined}
        role="dialog"
        aria-label={label}
        aria-hidden={retracted || undefined}
      >
        <button
          type="button"
          className="sheet-grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          aria-label={detent === PEEK ? "Show options" : "Hide options"}
          aria-expanded={detent !== PEEK}
        >
          <span aria-hidden="true" />
        </button>
        {children}
      </aside>
    </>,
    document.body
  );
}

// The sheet's own scroller. Everything below the summary row lives in here so
// that the row -- which carries the grabber and the close button -- stays put
// while a long option list moves under it.
export function SheetBody({ children }) {
  return <div className="sheet-body">{children}</div>;
}

// Pinned under the scroller rather than at the end of it: the design puts
// Duplicate and Delete where a thumb is, and an option list long enough to
// scroll would otherwise put them out of reach.
export function SheetFoot({ children }) {
  return <div className="sheet-foot">{children}</div>;
}
