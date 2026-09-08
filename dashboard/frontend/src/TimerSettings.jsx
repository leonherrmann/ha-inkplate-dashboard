// How often a running timer redraws itself on the panel.
//
// Only the two the panel's own settings screen offers. A third value here
// would be one the device could show but never be set back to from its own
// buttons, so the editor and the panel would stop being able to agree.

export const TIMER_TICKS = [
  { seconds: 5, label: "Every 5 seconds", hint: "Fewer refreshes, kinder over a long block" },
  { seconds: 1, label: "Every second", hint: "Smoothest to watch up close" },
];

export const DEFAULT_TIMER_TICK = 5;

export default function TimerSettings({ tickSeconds, onChange, autoStart, onAutoStartChange }) {
  const seconds = Number(tickSeconds ?? DEFAULT_TIMER_TICK);
  const chosen = TIMER_TICKS.find((one) => one.seconds === seconds);

  return (
    <section className="group">
      <h3>Timer updates</h3>

      {/* A group rather than a <label>: wrapping several controls in a label
          makes a screen reader read every one of them as the name of each. That
          exact defect has been fixed in this editor twice already. */}
      <div className="field" role="group" aria-label="Timer update rate">
        <span>Redraw</span>
        <select
          value={String(seconds)}
          onChange={(event) => onChange(Number(event.target.value))}
        >
          {TIMER_TICKS.map((option) => (
            <option key={option.seconds} value={String(option.seconds)}>
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
