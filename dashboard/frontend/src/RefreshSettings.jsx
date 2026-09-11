import { RefreshIcon } from "./Icons.jsx";

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
    short: "about every hour",
    estimate: "roughly every hour on a typical dashboard",
  },
  {
    percent: 12,
    label: "Balanced (recommended)",
    short: "about twice an hour · default",
    estimate: "roughly every 2 hours on a typical dashboard",
  },
  {
    percent: 25,
    label: "Relaxed — fewer flashes",
    short: "a few times a day",
    estimate: "roughly every 5 hours on a typical dashboard",
  },
  {
    percent: 50,
    label: "Rarely — expect visible ghosting",
    short: "rarely, more ghosting",
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
    <section className="card">
      <div className="card-head">
        <span className="token teal">
          <RefreshIcon size={16} width={2} />
        </span>
        <b>Screen refresh</b>
        <span className="report-age" style={{ marginLeft: "auto" }}>
          ghosting allowed
        </span>
      </div>

      <div className="choice-cards">
        {!known && (
          <div className="choice active">
            <span className="choice-mark" />
            <b>{percent} %</b>
            <small>set through the API</small>
          </div>
        )}
        {REFRESH_LEVELS.map((level) => {
          const active = level.percent === percent;
          return (
            <button
              key={level.percent}
              className={active ? "choice active" : "choice"}
              onClick={() => onChange({ ...value, ghost_percent: level.percent })}
              aria-pressed={active}
              title={level.label}
            >
              <span className="choice-mark" />
              <b>{level.percent} %</b>
              <small>{level.short}</small>
            </button>
          );
        })}
      </div>

      <p className="hint">
        The device flashes once {percent}% of the screen has ghosted —{" "}
        {known?.estimate || "how often depends on what is on screen"}. A page with a large
        clock reaches it about twice as fast.
      </p>
    </section>
  );
}
