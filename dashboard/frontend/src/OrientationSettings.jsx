import { OrientIcon } from "./Icons.jsx";

// Which way up the panel is hung.
//
// Deliberately not called "rotation" anywhere the user can see it: this editor
// already has a rotation, and that one is the slideshow through the pages. The
// two are unavoidably close in English, so this one is always "orientation" and
// always spoken about as turning the device over.
//
// Only 0 and 180. A quarter turn would swap the panel's width and height, and
// every widget on the canvas is placed in pixels against a 1280x720 grid, so it
// would not be a setting -- it would be a second grid, a second set of widget
// sizes, and a second version of every layout anyone has already built.

// 180 is "Normal" because that is the way up the panel is actually hung. Only
// the words changed -- the degrees are still the degrees, so stored layouts
// need no migration.
export const ORIENTATIONS = [
  { degrees: 180, label: "Upright", hint: "The usual way up" },
  { degrees: 0, label: "Upside down", hint: "Turned the other way up" },
];

export const DEFAULT_ORIENTATION = 0;

export default function OrientationSettings({ orientation, onChange }) {
  const degrees = Number(orientation ?? DEFAULT_ORIENTATION);

  return (
    <section className="card">
      <div className="card-head">
        <span className="token blue">
          <OrientIcon size={16} />
        </span>
        <b>Orientation</b>
      </div>

      {/* A group rather than a <label>: wrapping several buttons in a label
          makes a screen reader read every one of them as the name of each,
          so "Upside down" announces as "Orientation Upright Upside down". That
          exact defect has been fixed in this editor twice already. */}
      <div className="orient" role="group" aria-label="Screen orientation">
        {ORIENTATIONS.map((option) => (
          <button
            key={option.degrees}
            className={degrees === option.degrees ? "active" : undefined}
            onClick={() => onChange(option.degrees)}
            aria-pressed={degrees === option.degrees}
            title={option.hint}
          >
            <span className="orient-screen" />
            {option.label}
          </button>
        ))}
      </div>

      <p className="hint">
        Quarter turns are impossible — every widget fixes its box in pixels. The
        screen flashes once when this changes, because every pixel means
        something different afterwards.
      </p>
    </section>
  );
}
