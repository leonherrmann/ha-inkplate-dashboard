// Which theme the editor draws itself in. Three choices, not two: "auto" is the
// default and follows the system, which is also what Home Assistant's own auto
// theme does, so the add-on does not sit in a bright frame inside a dark HA. The
// two explicit choices are for when that guess is wrong.
//
// This is the editor only. The canvas keeps drawing black on white in both
// themes — see the .panel rule in styles.css — because the device does.

const KEY = "inkplate-dashboard-theme";

export const MODES = ["auto", "light", "dark"];

export const LABELS = { auto: "Auto", light: "Light", dark: "Dark" };

export function systemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readMode() {
  try {
    const stored = localStorage.getItem(KEY);
    return MODES.includes(stored) ? stored : "auto";
  } catch {
    // Storage can be refused outright in a locked-down browser. Following the
    // system is a fine answer, and the editor should not fail to load over it.
    return "auto";
  }
}

export function storeMode(mode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // As above: the choice just will not survive a reload
  }
}

// styles.css only knows "light" and "dark". Resolving "auto" here is what keeps
// the dark block in that file from having to exist twice, once behind a
// prefers-color-scheme query and once behind the explicit choice.
export function applyMode(mode) {
  document.documentElement.dataset.theme = mode === "auto" ? systemTheme() : mode;
}
