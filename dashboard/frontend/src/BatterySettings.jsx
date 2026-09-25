import { BatteryIcon } from "./Icons.jsx";

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
  5: "about 2 hours left awake",
  10: "about 4 hours left awake",
  15: "about 6 hours left awake",
  20: "about 8 hours left awake",
  30: "about 12 hours left awake",
};

export default function BatterySettings({ battery, onChange }) {
  const value = battery || {};
  const percent = Number(value.low_percent ?? DEFAULT_LOW_PERCENT);
  const set = (key, next) => onChange({ ...value, [key]: next });

  return (
    <section className="card">
      <div className="card-head">
        <span className="token yellow">
          <BatteryIcon size={16} />
        </span>
        <b>Low battery</b>
      </div>

      {/* A group rather than a <label>: see SleepSettings. */}
      <div className="field-block" role="group" aria-label="Warn below">
        <span>Warn below</span>
        <div className="pill-row">
          {LOW_LEVELS.map((level) => (
            <button
              key={level.percent}
              className={percent === level.percent ? "pill active" : "pill"}
              onClick={() => set("low_percent", level.percent)}
              aria-pressed={percent === level.percent}
            >
              {level.label}
            </button>
          ))}
        </div>
      </div>

      {percent > 0 && (
        <>
          {/* The same row as the timers' auto-start switch */}
          <div className="inspector-section" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div>
              <b style={{ fontSize: 13.5 }}>Full-screen warning</b>
              <div className="hint">Instead of the dashboard, until charged</div>
            </div>
            <label className="switch" style={{ marginLeft: "auto" }}>
              <span className="sr-only">Full-screen warning</span>
              <input
                type="checkbox"
                checked={Boolean(value.low_screen)}
                onChange={(event) => set("low_screen", event.target.checked)}
              />
            </label>
          </div>

          <p className="hint">
            At {percent}% or less{LEFT_AT[percent] ? ` — ${LEFT_AT[percent]} —` : ""} the
            battery chip shows an exclamation mark
            {value.low_screen
              ? ", and the panel shows a charging reminder instead of the dashboard. A button press brings the dashboard back until the battery has dropped another 5%."
              : ". Turn on the full-screen warning for a panel nobody looks at closely."}{" "}
            Both stop as soon as the panel is charging.
          </p>
        </>
      )}
      {percent === 0 && <p className="hint">The panel will not warn about its battery.</p>}
    </section>
  );
}
