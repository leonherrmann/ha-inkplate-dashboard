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
    <section className="group">
      <h3>Timer updates</h3>

      {/* A group rather than a <label>: wrapping several controls in a label
          makes a screen reader read every one of them as the name of each. That
          exact defect has been fixed in this editor twice already. */}
      <div className="field" role="group" aria-label="Timer update rate">
        <span>Redraw</span>
        <select
          value={String(ms)}
          onChange={(event) => onChange(Number(event.target.value))}
        >
          {TIMER_TICKS.map((option) => (
            <option key={option.ms} value={String(option.ms)}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <p className="hint">{chosen ? chosen.hint : ""}</p>

      <div className="field" role="group" aria-label="Pomodoro auto-start">
        <span>Pomodoro</span>
        <label className="switch">
          <input
            type="checkbox"
            checked={autoStart !== false}
            onChange={(event) => onAutoStartChange(event.target.checked)}
          />
          <span>Start the next block by itself</span>
        </label>
      </div>

      <p className="hint">
        Off means a focus block or break ends and waits on the panel until you
        press the middle button.
      </p>
    </section>
  );
}
