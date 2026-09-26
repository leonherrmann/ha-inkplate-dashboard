import { Segmented, Setting, Switch } from "./Setting.jsx";

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
  { ms: 5000, label: "Every 5 seconds", hint: "Fewest redraws, most responsive buttons" },
  { ms: 2500, label: "Every 2.5 seconds", hint: "Livelier, still leaves time for the buttons" },
];

export const DEFAULT_TIMER_TICK_MS = 5000;

export default function TimerSettings({ tickMs, onChange, autoStart, onAutoStartChange }) {
  const ms = Number(tickMs ?? DEFAULT_TIMER_TICK_MS);
  const chosen = TIMER_TICKS.find((one) => one.ms === ms);

  return (
    <>
      <Setting
        title="Countdown redraw"
        note={chosen?.hint}
        hint="How often a running timer redraws on the panel. It does not change the timer itself. The panel cannot watch its buttons while it redraws, which is why there is no faster setting."
        control={
          <Segmented
            label="Countdown redraw"
            value={ms}
            onChange={onChange}
            options={TIMER_TICKS.map((option) => ({ value: option.ms, label: `${option.ms / 1000} s` }))}
          />
        }
      />
      <Setting
        title="Pomodoro auto-start"
        note={
          autoStart === false
            ? "Each block waits for the middle button"
            : "The next block begins on its own"
        }
        control={
          <Switch label="Pomodoro auto-start" checked={autoStart !== false} onChange={onAutoStartChange} />
        }
      />
    </>
  );
}
