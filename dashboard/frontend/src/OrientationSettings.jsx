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

export const ORIENTATIONS = [
  { degrees: 0, label: "Normal", hint: "The way it comes" },
  { degrees: 180, label: "Upside down", hint: "Turned over, for hanging the other way up" },
];

export const DEFAULT_ORIENTATION = 0;

export default function OrientationSettings({ orientation, onChange }) {
  const degrees = Number(orientation ?? DEFAULT_ORIENTATION);

  return (
    <section className="group">
      <h3>Orientation</h3>

      {/* A group rather than a <label>: wrapping several buttons in a label
          makes a screen reader read every one of them as the name of each,
          so "Upside down" announces as "Orientation Normal Upside down". That
          exact defect has been fixed in this editor twice already. */}
      <div className="field" role="group" aria-label="Screen orientation">
        <span>Screen</span>
        <select
          value={String(degrees)}
          onChange={(event) => onChange(Number(event.target.value))}
        >
          {ORIENTATIONS.map((option) => (
            <option key={option.degrees} value={String(option.degrees)}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <p className="hint">
        Turns the whole dashboard over, for a panel mounted the other way up.
        The layout does not change — the same widgets stay in the same places,
        the picture is simply the other way round. The screen flashes once when
        it changes, because every pixel means something different afterwards.
      </p>
    </section>
  );
}
