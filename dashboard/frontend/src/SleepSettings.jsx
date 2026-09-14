import { MoonIcon } from "./Icons.jsx";

// Nightly deep sleep. e-ink keeps its image with the power off, so a sleeping
// device still shows the dashboard, it just stops updating.

const WAKE_CHOICES = [
  { minutes: 0, label: "Never" },
  { minutes: 15, label: "15" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "60" },
  { minutes: 120, label: "120" },
];

export default function SleepSettings({ sleep, onChange }) {
  const value = sleep || {};
  const set = (key, next) => onChange({ ...value, [key]: next });
  const wake = Number(value.wake_minutes ?? 30);

  return (
    <section className="card">
      <div className="card-head">
        <span className="token violet">
          <MoonIcon size={16} />
        </span>
        <b>Night sleep</b>
        <label className="switch" style={{ marginLeft: "auto" }}>
          <span className="sr-only">Sleep through the night to save battery</span>
          <input
            type="checkbox"
            checked={Boolean(value.enabled)}
            onChange={(event) => set("enabled", event.target.checked)}
          />
        </label>
      </div>

      {value.enabled && (
        <>
          <div className="field-row">
            <label className="time-box">
              <span>From</span>
              <input
                type="time"
                value={value.start || "23:00"}
                onChange={(event) => set("start", event.target.value)}
              />
            </label>
            <label className="time-box">
              <span>Until</span>
              <input
                type="time"
                value={value.end || "06:00"}
                onChange={(event) => set("end", event.target.value)}
              />
            </label>
          </div>

          {/* A group rather than a <label>: a label wrapping several buttons
              hands each of them the others' text as its accessible name. */}
          <div className="field-block" role="group" aria-label="Wake to collect pushes">
            <span>Wake to collect pushes</span>
            <div className="pill-row">
              {WAKE_CHOICES.map((choice) => (
                <button
                  key={choice.minutes}
                  className={wake === choice.minutes ? "pill active" : "pill"}
                  onClick={() => set("wake_minutes", choice.minutes)}
                  aria-pressed={wake === choice.minutes}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>

          <p className="hint">
            {wake === 0
              ? "The clock will show the time it went to sleep until morning, and a push will not arrive until then."
              : "Each wake takes about 20 seconds, enough to refresh the clock and collect anything pushed while asleep."}
          </p>
        </>
      )}
    </section>
  );
}
