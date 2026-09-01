// How often the panel clears itself. e-ink can repaint quickly, but each quick
// repaint leaves a faint ghost of what was there before; only the slow
// black-flash refresh clears them. The device counts how much of the screen has
// actually ghosted and flashes once it passes this share, so a dashboard where
// only the clock moves goes far longer between flashes than a busy one.
//
// The setting is a percentage of the screen rather than a number of minutes,
// because minutes are not something either side can honestly promise: the same
// setting is an hour on a big clock and over two hours on a typical dashboard.
// The estimates below are measured, not guessed -- see RefreshPolicy.h in the
// firmware for where the per-minute figures come from.

export const REFRESH_LEVELS = [
  {
    percent: 6,
    label: "Cleanest — clears often",
    estimate: "roughly every hour on a typical dashboard",
  },
  {
    percent: 12,
    label: "Balanced (recommended)",
    estimate: "roughly every 2 hours on a typical dashboard",
  },
  {
    percent: 25,
    label: "Relaxed — fewer flashes",
    estimate: "roughly every 5 hours on a typical dashboard",
  },
  {
    percent: 50,
    label: "Rarely — expect visible ghosting",
    estimate: "most of a day on a typical dashboard",
  },
];

export const DEFAULT_GHOST_PERCENT = 12;

export default function RefreshSettings({ refresh, onChange }) {
  const value = refresh || {};
  const percent = Number(value.ghost_percent ?? DEFAULT_GHOST_PERCENT);

  // An unrecognised value is still shown rather than silently snapped to a
  // neighbour: the device accepts any percentage, so one set through the API
  // is legitimate and quietly rewriting it on the next save would be wrong.
  const known = REFRESH_LEVELS.find((level) => level.percent === percent);

  return (
    <section className="group">
      <h3>Screen refresh</h3>

      <label className="field">
        <span>Clear the screen</span>
        <select
          value={String(percent)}
          onChange={(event) =>
            onChange({ ...value, ghost_percent: Number(event.target.value) })
          }
        >
          {!known && <option value={String(percent)}>Custom — {percent}% of the screen</option>}
          {REFRESH_LEVELS.map((level) => (
            <option key={level.percent} value={String(level.percent)}>
              {level.label}
            </option>
          ))}
        </select>
      </label>

      <p className="hint">
        Quick updates leave a faint ghost of the previous image; a full refresh
        flashes the screen black to clear them. The device flashes once{" "}
        {percent}% of the screen has ghosted — {known?.estimate || "how often depends on what is on screen"}.
        A page with a large clock reaches it about twice as fast.
      </p>
    </section>
  );
}
