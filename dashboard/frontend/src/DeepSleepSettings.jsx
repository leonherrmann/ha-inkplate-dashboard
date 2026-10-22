import { Segmented, Setting } from "./Setting.jsx";

// Deep sleep between updates. The panel wakes every so many minutes, collects
// what changed, draws it once and goes back to sleep; e-ink keeps the picture
// in between. It is what makes a battery last a week rather than a couple of
// days -- an awake panel spends most of its charge waiting for something to
// happen. A button on the panel wakes it straight away.
//
// Stored as refresh.deep_sleep_minutes: the firmware reads it there, beside
// the other settings about how often the dashboard changes. 0 or absent is off.

export const DEEP_SLEEP_CHOICES = [
  { minutes: 0, label: "Off", title: "Stay awake and update as things change" },
  { minutes: 1, label: "1m", title: "Every minute" },
  { minutes: 2, label: "2m", title: "Every 2 minutes" },
  { minutes: 3, label: "3m", title: "Every 3 minutes" },
  { minutes: 5, label: "5m", title: "Every 5 minutes" },
  { minutes: 10, label: "10m", title: "Every 10 minutes" },
  { minutes: 15, label: "15m", title: "Every 15 minutes" },
  { minutes: 30, label: "30m", title: "Every 30 minutes" },
  { minutes: 60, label: "1h", title: "Every hour" },
];

export function deepSleepMinutes(refresh) {
  const minutes = Number(refresh?.deep_sleep_minutes ?? 0);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

// "every 5 min", "every hour" -- for a summary line.
export function deepSleepPhrase(minutes) {
  if (minutes >= 60 && minutes % 60 === 0) {
    return minutes === 60 ? "every hour" : `every ${minutes / 60} h`;
  }
  return minutes === 1 ? "every minute" : `every ${minutes} min`;
}

// The warning the clock gets wherever it is shown. One sentence, so the
// settings and the editor cannot drift apart.
export function clockWarning(minutes) {
  return `The panel sleeps between updates, so a clock only moves when it wakes — it can be up to ${
    minutes === 60 ? "an hour" : minutes === 1 ? "a minute" : `${minutes} minutes`
  } behind.`;
}

export default function DeepSleepSettings({ refresh, onChange, hasClock }) {
  const value = refresh || {};
  const minutes = deepSleepMinutes(value);
  const known = DEEP_SLEEP_CHOICES.some((choice) => choice.minutes === minutes);

  return (
    <>
      <Setting
        stacked
        title="Sleep between updates"
        note={
          minutes === 0
            ? "Off: the panel stays awake and updates as things change"
            : `Wakes ${deepSleepPhrase(minutes)} to update, then sleeps`
        }
        hint={
          <>
            The panel goes into deep sleep and wakes on a timer to collect what changed, draw it
            and sleep again. E-ink keeps the picture meanwhile. This is what makes a battery last
            a week rather than a couple of days. Pressing a button on the panel wakes it at once
            and keeps it awake for a minute. Layouts you push, and buttons in Home Assistant, wait
            for the next wake.
          </>
        }
        control={
          <Segmented
            label="Sleep between updates"
            value={minutes}
            onChange={(next) => onChange({ ...value, deep_sleep_minutes: next })}
            options={[
              ...DEEP_SLEEP_CHOICES.map((choice) => ({
                value: choice.minutes,
                label: choice.label,
                title: choice.title,
              })),
              ...(known ? [] : [{ value: minutes, label: `${minutes}m` }]),
            ]}
          />
        }
      />
      {minutes > 0 && (
        <div className={hasClock ? "note warn deep-sleep-note" : "note deep-sleep-note"}>
          {hasClock
            ? clockWarning(minutes)
            : "A clock added to this panel would only move when it wakes."}
        </div>
      )}
    </>
  );
}
