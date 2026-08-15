// Nightly deep sleep. e-ink keeps its image with the power off, so a sleeping
// device still shows the dashboard, it just stops updating.

export default function SleepSettings({ sleep, onChange }) {
  const value = sleep || {};
  const set = (key, next) => onChange({ ...value, [key]: next });

  return (
    <section className="group">
      <h3>Night sleep</h3>

      <label className="switch">
        <input
          type="checkbox"
          checked={Boolean(value.enabled)}
          onChange={(event) => set("enabled", event.target.checked)}
        />
        <span>Sleep through the night to save battery</span>
      </label>

      {value.enabled && (
        <>
          <div className="field-row">
            <label className="field">
              <span>From</span>
              <input
                type="time"
                value={value.start || "23:00"}
                onChange={(event) => set("start", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Until</span>
              <input
                type="time"
                value={value.end || "06:00"}
                onChange={(event) => set("end", event.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span>Wake to refresh</span>
            <select
              value={String(value.wake_minutes ?? 30)}
              onChange={(event) => set("wake_minutes", Number(event.target.value))}
            >
              <option value="0">Never — sleep right through</option>
              <option value="15">Every 15 minutes</option>
              <option value="30">Every 30 minutes</option>
              <option value="60">Every hour</option>
              <option value="120">Every 2 hours</option>
            </select>
          </label>

          <p className="hint">
            {Number(value.wake_minutes) === 0
              ? "The clock will show the time it went to sleep until morning, and a push will not arrive until then."
              : "Each wake takes about 20 seconds, enough to refresh the clock and collect anything pushed while asleep."}
          </p>
        </>
      )}
    </section>
  );
}
