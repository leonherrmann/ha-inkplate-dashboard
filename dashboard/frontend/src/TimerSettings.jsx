import { TimerIcon } from "./Icons.jsx";

// How often a running timer redraws itself on the panel.
//
// Only the two the panel's own settings screen offers. A third value here
// would be one the device could show but never be set back to from its own
// buttons, so the editor and the panel would stop being able to agree.

// In milliseconds, because 2.5s is one of them.
//
// A one-second option existed in 2026.9.26 and has been withdrawn: the panel
// cannot watch its buttons while it redraws, and at that rate it was redrawing
// more than half the time, so presses went missing.
export const TIMER_TICKS = [
  { ms: 5000, label: "Every 5 seconds", hint: "Fewest refreshes, and the most responsive buttons" },
  { ms: 2500, label: "Every 2.5 seconds", hint: "Livelier, and still leaves the panel time to watch its buttons" },
];

export const DEFAULT_TIMER_TICK_MS = 5000;

export default function TimerSettings({ tickMs, onChange, autoStart, onAutoStartChange }) {
  const ms = Number(tickMs ?? DEFAULT_TIMER_TICK_MS);
  const chosen = TIMER_TICKS.find((one) => one.ms === ms);

  return (
    <section className="card">
      <div className="card-head">
        <span className="token yellow">
          <TimerIcon size={16} />
        </span>
        <b>Timers</b>
      </div>

      {/* A group rather than a <label>: a label wrapping several buttons hands
          each of them the others' text as its accessible name. */}
      <div className="group-actions" role="group" aria-label="Timer update rate">
        <span style={{ fontSize: 12, color: "var(--ink-60)" }}>Update rate</span>
        <div className="seg" style={{ marginLeft: "auto" }}>
          {TIMER_TICKS.map((option) => (
            <button
              key={option.ms}
              className={ms === option.ms ? "active" : undefined}
              onClick={() => onChange(option.ms)}
              aria-pressed={ms === option.ms}
              title={option.hint}
            >
              {option.ms / 1000} s
            </button>
          ))}
        </div>
      </div>

      <p className="hint">Display cadence only — it does not change the timer itself.</p>

      <div className="inspector-section" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div>
          <b style={{ fontSize: 13.5 }}>Pomodoro auto-start</b>
          <div className="hint">Next interval begins on its own</div>
        </div>
        <label className="switch" style={{ marginLeft: "auto" }}>
          <span className="sr-only">Pomodoro auto-start</span>
          <input
            type="checkbox"
            checked={autoStart !== false}
            onChange={(event) => onAutoStartChange(event.target.checked)}
          />
        </label>
      </div>

      <p className="hint">
        {autoStart === false
          ? "A focus block or break ends and waits on the panel until you press the middle button."
          : chosen?.hint || ""}
      </p>
    </section>
  );
}
