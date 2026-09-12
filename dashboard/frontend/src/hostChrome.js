// Home Assistant serves this add-on in an iframe through ingress, and on the
// iOS app that iframe stops 34px short of the bottom of the screen -- the
// height of the home indicator. Home Assistant fills the gap with its own
// background, so a bare strip of a different colour sits under our tab bar.
//
// Nothing inside the iframe can paint that strip: it is not our document. The
// measurement that settled it is that `env(safe-area-inset-bottom)` reads 0
// inside the frame while the strip is plainly the height of the safe area --
// the inset has already been applied by the page above us.
//
// Ingress is same-origin, though (`/api/hassio_ingress/<token>/` on the same
// host), so the page above is reachable, and one background colour on it makes
// the strip match the app. That is the whole change: no layout is touched, no
// element is moved, nothing is added to their DOM.
//
// Everything is guarded, and cross-origin is a no-op rather than an error --
// this has to fail quietly, because a strip of the wrong colour is a far
// smaller problem than an editor that will not start.

// The band takes --host-band, which the stylesheet sets per breakpoint: the tab
// bar's own surface where there is a tab bar above it, so the two read as one
// surface running to the bottom edge, and the ground where there is not.
const band = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--host-band").trim() ||
  "#efece6";

export function blendHostBackground() {
  let restore = () => {};

  try {
    // Not framed at all: opened directly, nothing above us to blend with.
    if (window.parent === window) return restore;

    // Throws on a cross-origin parent, which is the answer we want anyway.
    const doc = window.parent.document;
    if (!doc) return restore;

    // Both, because either can be the one actually painting the strip. The
    // canvas takes its colour from <html>, but a <body> with a background of
    // its own paints over that inside its own box -- and Home Assistant gives
    // body the theme colour and a full-height box. Setting only <html> changed
    // nothing at all, which is how this was found.
    const targets = [doc.documentElement, doc.body].filter(Boolean);
    const previous = targets.map((el) => el.style.backgroundColor);

    // Inline, so it beats the theme's stylesheet rule without !important.
    const paint = () => {
      const colour = band();
      targets.forEach((el) => {
        el.style.backgroundColor = colour;
      });
    };
    paint();

    // Turning the phone crosses the breakpoint, and the band has to change with
    // it -- the tab bar's surface is only the right colour while there is a tab
    // bar above the band.
    const narrow = window.matchMedia("(max-width: 820px)");
    narrow.addEventListener("change", paint);

    restore = () => {
      try {
        narrow.removeEventListener("change", paint);
        targets.forEach((el, i) => {
          el.style.backgroundColor = previous[i];
        });
      } catch {
        // The parent went away first, which is the case this exists to survive
      }
    };

    // Home Assistant is a single-page app, so leaving the add-on destroys this
    // frame rather than reloading the page above. pagehide fires here for both,
    // and putting their colour back is the difference between borrowing it and
    // keeping it.
    window.addEventListener("pagehide", restore, { once: true });
  } catch {
    // Cross-origin, a sandboxed frame, or a Home Assistant that has changed how
    // ingress is served. All three mean the same thing: leave it alone.
  }

  return restore;
}
