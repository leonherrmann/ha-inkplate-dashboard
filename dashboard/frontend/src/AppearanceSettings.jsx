import { useEffect, useState } from "react";

import { Segmented, Setting } from "./Setting.jsx";
import { onThemeChange, resolvedTheme, setThemeChoice, themeChoice, themeSource } from "./theme.js";
import { measureHost, probeHost } from "./hostChrome.js";

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

// What the editor measured about the frame it is in, in numbers a screenshot
// can carry. The tab bar's place in the Home Assistant app cannot be checked
// anywhere but on a phone, and these are what it is placed from.
export function ScreenFit() {
  const [found, setFound] = useState(() => measureHost());
  const [probe, setProbe] = useState(() => (window.parent !== window ? probeHost() : []));
  useEffect(() => {
    const update = () => {
      setFound(measureHost());
      if (window.parent !== window) setProbe(probeHost());
    };
    window.addEventListener("inkplate-host-fit", update);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("inkplate-host-fit", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const note = !found.framed
    ? `Not framed · home indicator ${Math.round(found.frameInset)} px`
    : found.unreadable
      ? "Framed, but the page above cannot be measured"
      : `Frame ends ${found.gap} px above the page's foot (padded ${found.framePad}) · page ${found.topHeight} of ${
          found.screenHeight
        } px · home indicator ${Math.round(found.hostInset)} px · tab bar lifted ${
          found.clearance
        } px · strip ${found.band || "unknown"}${found.banded ? " (matched)" : ""}`;

  return (
    <Setting
      stacked
      title="Screen fit"
      note={note}
      hint="Where the editor sits inside the Home Assistant app, which is what the tab bar is placed from. Shown while its position on iPhones is being checked."
      control={
        probe.length > 0 && (
          <pre className="screen-fit-probe">{probe.join("\n")}</pre>
        )
      }
    />
  );
}
