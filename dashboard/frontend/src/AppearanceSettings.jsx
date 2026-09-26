import { useEffect, useState } from "react";

import { MonitorIcon } from "./Icons.jsx";
import { onThemeChange, resolvedTheme, setThemeChoice, themeChoice, themeSource } from "./theme.js";

// Light or dark, for this editor only.
//
// It sits among the device's settings because that is where settings are, but
// it is the one on this screen that goes nowhere: it is kept in this browser,
// it is not pushed, and the panel is black on white whatever it says. The
// canvas follows the panel rather than this, for the same reason.
export const THEME_LABELS = { auto: "Automatic", light: "Light", dark: "Dark" };

export function useThemeChoice() {
  const [state, setState] = useState(() => ({ choice: themeChoice(), theme: resolvedTheme() }));
  useEffect(
    () => onThemeChange(() => setState({ choice: themeChoice(), theme: resolvedTheme() })),
    []
  );
  return state;
}

export default function AppearanceSettings() {
  const { choice, theme } = useThemeChoice();

  return (
    <section className="card">
      <div className="card-head">
        <span className="token violet">
          <MonitorIcon size={16} />
        </span>
        <b>Appearance</b>
      </div>

      <div className="seg wide" role="group" aria-label="Editor theme">
        {["auto", "light", "dark"].map((one) => (
          <button
            key={one}
            className={choice === one ? "active" : undefined}
            onClick={() => setThemeChoice(one)}
            aria-pressed={choice === one}
          >
            {one === "auto" ? "Auto" : THEME_LABELS[one]}
          </button>
        ))}
      </div>

      <p className="hint">
        {choice === "auto"
          ? `Following ${themeSource() === "home-assistant" ? "Home Assistant" : "this device"}, which is ${theme} right now. `
          : ""}
        This editor only, kept in this browser. The panel and its preview stay black on white.
      </p>
    </section>
  );
}
