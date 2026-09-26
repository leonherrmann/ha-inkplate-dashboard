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

// Framed at all, whatever the origin. The stylesheet reads it to leave the home
// indicator's clearance to the page above -- see --safe-bottom.
export function markFramed() {
  try {
    if (window.parent !== window) document.documentElement.setAttribute("data-framed", "");
  } catch {
    // Reading window.parent itself never throws; this is only belt and braces
  }
}

// How tall env(safe-area-inset-bottom) is in a document, read off an element
// sized by it -- there is no other way to ask for an env() value.
function insetIn(doc) {
  const probe = doc.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;bottom:0;width:1px;height:env(safe-area-inset-bottom,0px);" +
    "visibility:hidden;pointer-events:none";
  doc.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

// Where this frame sits in the page above it, and how much of the phone's
// home-indicator area it really overlaps.
//
// Measured on an iPhone in the Home Assistant app (2026-09-26): the frame runs
// to the bottom of Home Assistant's page and the page reports a 34px inset --
// but the page itself stops above the home indicator, and the strip under it
// is the app's own, drawn outside every web view. So the inset is only ours to
// leave when the top page reaches the bottom of the screen, which is judged by
// how much shorter than the screen it is.
export function measureHost() {
  const result = { framed: window.parent !== window, frameInset: 0 };
  try {
    result.frameInset = insetIn(document);
    if (!result.framed || !window.frameElement) return result;
    const frame = window.frameElement.getBoundingClientRect();
    result.hostInset = insetIn(window.parent.document);
    result.hostHeight = window.parent.innerHeight;
    result.gap = Math.round(result.hostHeight - frame.bottom);
    result.screenHeight = window.screen.height;
    result.topHeight = window.top.innerHeight;
    result.reachesBottom = result.screenHeight - result.topHeight < result.hostInset / 2;
    // A frame that runs past the page's foot still needs lifting by the
    // overrun, whether or not the page reaches the bottom of the screen.
    const inset = result.reachesBottom ? result.hostInset : 0;
    result.clearance = Math.max(0, Math.min(80, Math.round(inset - result.gap)));
    // The colour the app paints that strip with: Home Assistant's own
    // background, which is what the strip was measured to be on 2026-09-12.
    result.band = getComputedStyle(window.parent.document.documentElement)
      .getPropertyValue("--primary-background-color")
      .trim();
  } catch {
    result.unreadable = true;
  }
  return result;
}

// How light a CSS colour is, 0..1, or null for one this cannot read
function lightness(colour) {
  const probe = document.createElement("span");
  probe.style.color = colour;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color.match(/[\d.]+/g);
  probe.remove();
  if (!rgb || rgb.length < 3) return null;
  const [r, g, b] = rgb.map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Keeps --safe-bottom at the measured clearance, and gives the tab bar the
// strip's colour when there is a strip under it: the bar and the strip then
// read as one surface to the bottom of the screen, as an app's own tab bar
// does. Only when the colour suits the theme the editor is in -- a dark bar
// under light-theme labels would be unreadable. Re-measured when anything that
// moves the frame can have changed.
export function fitToHost() {
  if (window.parent === window) return;
  const root = document.documentElement;
  const apply = () => {
    const found = measureHost();
    if (found.clearance === undefined) return;
    root.style.setProperty("--safe-bottom", `${found.clearance}px`);
    const light = found.band ? lightness(found.band) : null;
    const dark = root.dataset.theme === "dark";
    const suits = light !== null && (dark ? light < 0.35 : light > 0.8);
    if (!found.reachesBottom && suits) root.style.setProperty("--tabbar", found.band);
    else root.style.removeProperty("--tabbar");
    found.banded = !found.reachesBottom && suits;
    window.dispatchEvent(new CustomEvent("inkplate-host-fit", { detail: found }));
  };
  apply();
  [300, 1000, 3000].forEach((ms) => setTimeout(apply, ms));
  window.addEventListener("resize", apply);
  window.addEventListener("inkplate-theme", apply);
  window.visualViewport?.addEventListener("resize", apply);
  try {
    window.parent.addEventListener("resize", apply);
  } catch {
    // Cross-origin: nothing to listen to, and nothing was measured either
  }
}

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

    // And so does the theme: the band is ground or tab bar, and both flip.
    window.addEventListener("inkplate-theme", paint);

    restore = () => {
      try {
        narrow.removeEventListener("change", paint);
        window.removeEventListener("inkplate-theme", paint);
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
