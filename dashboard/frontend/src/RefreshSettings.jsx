import { Segmented, Setting } from "./Setting.jsx";

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
  { percent: 6, name: "Often", short: "about every hour", estimate: "Roughly every hour on a typical dashboard" },
  { percent: 12, name: "Balanced", short: "about twice an hour · default", estimate: "Roughly every 2 hours on a typical dashboard" },
  { percent: 25, name: "Rarely", short: "a few times a day", estimate: "Roughly every 5 hours on a typical dashboard" },
  { percent: 50, name: "Seldom", short: "rarely, more ghosting", estimate: "Most of a day, with visible ghosting" },
];

export const DEFAULT_GHOST_PERCENT = 12;

// How often a *changed reading* may repaint the panel -- the other half of the
// refresh block, and a different question from the one above. A CO2 sensor
// that publishes every few seconds would otherwise repaint the whole panel each
// time. Nothing is dropped: a held-back card is drawn at its newest value by
// the next repaint that happens for any reason, and the clock's minute and page
// turns are never held back. The firmware reads refresh.min_interval as a
// duration, or "off", and defaults to 30 seconds when it is absent.
export const UPDATE_FLOORS = [
  { value: "off", label: "Instantly", note: "As soon as a reading moves; costs the most battery" },
  { value: "30s", label: "30 s", note: "Default" },
  { value: "1m", label: "1 min", note: "" },
  { value: "5m", label: "5 min", note: "Saves battery" },
  { value: "15m", label: "15 min", note: "Saves the most battery" },
];

export const DEFAULT_UPDATE_FLOOR = "30s";

export default function RefreshSettings({ refresh, onChange }) {
  const value = refresh || {};
  const percent = Number(value.ghost_percent ?? DEFAULT_GHOST_PERCENT);

  // An unrecognised value is still shown rather than silently snapped to a
  // neighbour: the device accepts any percentage, so one set through the API
  // is legitimate and quietly rewriting it on the next save would be wrong.
  const known = REFRESH_LEVELS.find((level) => level.percent === percent);
  const floor = String(value.min_interval ?? DEFAULT_UPDATE_FLOOR);
  const knownFloor = UPDATE_FLOORS.find((one) => one.value === floor);

  return (
    <>
      <Setting
        stacked
        title="Clear ghosting"
        note={known ? known.estimate : `${percent}%, set through the API`}
        hint={
          <>
            Quick repaints leave faint ghosts; a full black flash clears them. The panel
            flashes once this share of the screen has ghosted: <b>6%</b> often,{" "}
            <b>12%</b> balanced, <b>25%</b> rarely, <b>50%</b> seldom. A page with a large
            clock gets there about twice as fast.
          </>
        }
        control={
          <Segmented
            label="Clear ghosting"
            value={percent}
            onChange={(next) => onChange({ ...value, ghost_percent: next })}
            options={[
              ...REFRESH_LEVELS.map((level) => ({
                value: level.percent,
                label: level.name,
                title: `Flash at ${level.percent}% ghosted`,
              })),
              ...(known ? [] : [{ value: percent, label: `${percent}%` }]),
            ]}
          />
        }
      />
      <Setting
        stacked
        title="Redraw changed readings"
        note={knownFloor ? knownFloor.note || "At most once a minute" : `${floor}, set through the API`}
        hint={
          <>
            Each repaint costs battery. A reading held back is still drawn at its newest
            value by the next repaint for any other reason — the clock&apos;s minute, a
            page turn — so a page with a clock is never more than a minute behind. A
            widget can set its own, longer limit under Advanced.
          </>
        }
        control={
          <Segmented
            label="Redraw changed readings"
            value={floor}
            onChange={(next) => onChange({ ...value, min_interval: next })}
            options={[
              ...UPDATE_FLOORS.map((one) => ({ value: one.value, label: one.label })),
              ...(knownFloor ? [] : [{ value: floor, label: floor }]),
            ]}
          />
        }
      />
    </>
  );
}
