import { useEffect, useState } from "react";

import { Segmented, Setting } from "./Setting.jsx";
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
    <Setting
      title="Theme"
      note={
        choice === "auto"
          ? `Following ${themeSource() === "home-assistant" ? "Home Assistant" : "this device"} (${theme})`
          : "Kept in this browser"
      }
      hint="This editor only, kept in this browser. The panel and its preview stay black on white."
      control={
        <Segmented
          label="Editor theme"
          value={choice}
          onChange={setThemeChoice}
          options={["auto", "light", "dark"].map((one) => ({
            value: one,
            label: one === "auto" ? "Auto" : THEME_LABELS[one],
          }))}
        />
      }
    />
  );
}
