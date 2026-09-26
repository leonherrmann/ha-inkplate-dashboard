import { Segmented, Setting, Switch } from "./Setting.jsx";

// When the panel counts its battery as low, and what it does about it.
//
// The percentage is the panel's own, read off its measured discharge curve
// (firmware with the battery-alert work), so a level here is charge left rather than a
// voltage. Below it the battery chip swaps its fill for an exclamation mark;
// with the full-screen warning on, the panel also stops showing the
// dashboard and says to charge it, until it is charging or a button is
// pressed. Both stop the moment it is on the charger.

export const DEFAULT_LOW_PERCENT = 15;

export const LOW_LEVELS = [
  { percent: 0, label: "Off" },
  { percent: 5, label: "5 %" },
  { percent: 10, label: "10 %" },
  { percent: 15, label: "15 %" },
  { percent: 20, label: "20 %" },
  { percent: 30, label: "30 %" },
];

// Roughly how long each level leaves, on the V2's own measured run with
// night sleep off. A layout that repaints less lasts longer.
const LEFT_AT = {
  5: "About 2 hours left awake",
  10: "About 4 hours left awake",
  15: "About 6 hours left awake",
  20: "About 8 hours left awake",
  30: "About 12 hours left awake",
};

export default function BatterySettings({ battery, onChange }) {
  const value = battery || {};
  const percent = Number(value.low_percent ?? DEFAULT_LOW_PERCENT);
  const set = (key, next) => onChange({ ...value, [key]: next });

  return (
    <>
      <Setting
        stacked
        title="Low battery warning"
        note={percent === 0 ? "The panel will not warn about its battery" : LEFT_AT[percent] || null}
        hint="Below this the battery chip on the panel shows an exclamation mark. It stops as soon as the panel is charging."
        control={
          <Segmented
            label="Warn below"
            value={percent}
            onChange={(next) => set("low_percent", next)}
            options={LOW_LEVELS.map((level) => ({ value: level.percent, label: level.label }))}
          />
        }
      />
      {percent > 0 && (
        <Setting
          title="Full-screen reminder"
          note="Instead of the dashboard, until charged"
          hint="For a panel nobody looks at closely. A button press brings the dashboard back until the battery drops another 5%."
          control={
            <Switch
              label="Full-screen reminder"
              checked={Boolean(value.low_screen)}
              onChange={(next) => set("low_screen", next)}
            />
          }
        />
      )}
    </>
  );
}
