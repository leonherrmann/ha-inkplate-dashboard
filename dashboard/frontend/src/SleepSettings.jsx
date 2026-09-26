import { Segmented, Setting, Switch } from "./Setting.jsx";

// Nightly deep sleep. e-ink keeps its image with the power off, so a sleeping
// device still shows the dashboard, it just stops updating.

const WAKE_CHOICES = [
  { minutes: 0, label: "Never" },
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 h" },
  { minutes: 120, label: "2 h" },
];

export default function SleepSettings({ sleep, onChange }) {
  const value = sleep || {};
  const set = (key, next) => onChange({ ...value, [key]: next });
  const wake = Number(value.wake_minutes ?? 30);

  return (
    <>
      <Setting
        title="Night sleep"
        note={value.enabled ? "The dashboard stays up; it stops updating" : "Off"}
        hint="E-ink keeps its picture with the power off, so a sleeping panel still shows the dashboard. It just stops updating until morning, which saves most of a night's battery."
        control={
          <Switch
            label="Sleep through the night"
            checked={Boolean(value.enabled)}
            onChange={(next) => set("enabled", next)}
          />
        }
      />

      {value.enabled && (
        <>
          <Setting
            title="Hours"
            control={
              <div className="time-pair">
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
            }
          />
          <Setting
            stacked
            title="Wake to check for changes"
            note={
              wake === 0
                ? "The clock stops overnight, and changes wait until morning"
                : "Every wake takes about 20 seconds"
            }
            hint="While asleep the panel can wake briefly to move the clock on and collect anything pushed. More often costs more battery."
            control={
              <Segmented
                label="Wake to check for changes"
                value={wake}
                onChange={(next) => set("wake_minutes", next)}
                options={WAKE_CHOICES.map((choice) => ({ value: choice.minutes, label: choice.label }))}
              />
            }
          />
        </>
      )}
    </>
  );
}
