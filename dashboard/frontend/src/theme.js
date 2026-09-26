// Light or dark, and who decides.
//
// The default is to follow Home Assistant, because the editor is always seen
// inside it: a white add-on in a dark Home Assistant is a flashlight in the
// face, and the person already told Home Assistant which they want. It can be
// overridden here, per browser, since that is a preference about a screen and
// not about the panel -- nothing of it goes to the backend.
//
// Home Assistant's own choice is read off the page above us, which ingress
// makes same-origin (see hostChrome.js). `hass.themes.darkMode` is what its
// frontend resolved from the user's profile, their theme and the OS together,
// so it is right even when someone has forced Home Assistant dark on a light
// OS. Opened directly, or if that ever stops being reachable, the OS setting is
// the next best answer to the same question.
//
// The stylesheet does the rest: this only sets <html data-theme>, and every
// colour is a token that block overrides. The canvas ignores it on purpose.

const KEY = "inkplate-theme";
export const THEME_CHOICES = ["auto", "light", "dark"];

let choice = readChoice();
const listeners = new Set();

function readChoice() {
  try {
    const stored = window.localStorage.getItem(KEY);
    return THEME_CHOICES.includes(stored) ? stored : "auto";
  } catch {
    // Safari in a private window throws on localStorage
    return "auto";
  }
}

function hostDarkMode() {
  try {
    if (window.parent === window) return undefined;
    const dark = window.parent.document.querySelector("home-assistant")?.hass?.themes?.darkMode;
    return typeof dark === "boolean" ? dark : undefined;
  } catch {
    // Cross-origin or sandboxed: Home Assistant is not ours to ask
    return undefined;
  }
}

const osDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

export function resolvedTheme() {
  if (choice !== "auto") return choice;
  return (hostDarkMode() ?? osDark()) ? "dark" : "light";
}

// Who Auto is listening to, so the setting can say so rather than claim Home
// Assistant when the editor was opened on its own.
export function themeSource() {
  return hostDarkMode() === undefined ? "system" : "home-assistant";
}

export function themeChoice() {
  return choice;
}

function apply() {
  const theme = resolvedTheme();
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  root.dataset.theme = theme;
  // hostChrome.js repaints the band under the frame from this
  window.dispatchEvent(new CustomEvent("inkplate-theme", { detail: theme }));
  listeners.forEach((listener) => listener(theme));
}

export function setThemeChoice(next) {
  choice = THEME_CHOICES.includes(next) ? next : "auto";
  try {
    window.localStorage.setItem(KEY, choice);
  } catch {
    // Not remembered, still applied
  }
  apply();
  listeners.forEach((listener) => listener(resolvedTheme()));
}

export function onThemeChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Called once, before the first render, so the editor never paints light and
// then flips.
export function initTheme() {
  apply();

  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", apply);

  // Home Assistant switches theme without telling anyone. Applying one writes
  // its variables onto the style of its <html>, so that attribute changing is
  // the moment to ask again; coming back to the tab covers anything missed.
  try {
    if (window.parent !== window) {
      new MutationObserver(apply).observe(window.parent.document.documentElement, {
        attributes: true,
        attributeFilter: ["style", "class"],
      });
    }
  } catch {
    // Cross-origin: the OS listener above is all there is
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) apply();
  });
}
