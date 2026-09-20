import { OrientIcon } from "./Icons.jsx";

// Which way up the panel is hung.
//
// Deliberately not called "rotation" anywhere the user can see it: this editor
// already has a rotation, and that one is the slideshow through the pages. The
// two are unavoidably close in English, so this one is always "orientation" and
// always spoken about as turning the device over.
//
// All four, since 2026.9.61. A quarter turn swaps the panel's width and height
// and the firmware turns its grid with it -- a V2 is 3 columns by 6 rather than
// 5 by 3 -- and it republishes its manifest, so this editor follows within a
// second of the panel turning.
//
// What makes that affordable is that the *cell* does not change: 210x172 on
// both panels and both ways up. A widget is the same picture whichever way the
// panel stands; what changes is how many of them fit and where.
//
// A layout drawn for the other shape is not thrown away. The panel re-places
// each card on the cell it was on and drops what no longer fits, which is the
// same fitting it already does when a layout drawn for a V2 arrives at a V1.

// 0 is upright. These two were the other way round between 2026-09-08 and
// 2026-09-12, on the stated grounds that it "matches the firmware" -- it does
// not, and the firmware says so twice:
//
//   ConfigManager.cpp  "the orientation someone looking at the panel calls 0
//                      -- the way it has always looked -- is rotation 2", and
//                      naming it otherwise "would mean a fresh device shipping
//                      as 180 degrees, which is nonsense to the person reading
//                      it"
//   sim/host/UiCheck   check(model.orientation() == 0, "so the panel has not
//                      turned over")
//
// The symptom was quiet: DEFAULT_ORIENTATION is 0, so a panel nobody had
// touched showed "Upside down" as its setting, and choosing "Upright" sent 180
// and actually turned it over. Only the labels move here -- the degrees are
// still the degrees, so stored layouts need no migration.
export const ORIENTATIONS = [
  { degrees: 0, label: "Upright", hint: "The usual way up", portrait: false },
  { degrees: 90, label: "On its side", hint: "Turned a quarter clockwise", portrait: true },
  { degrees: 180, label: "Upside down", hint: "Turned the other way up", portrait: false },
  { degrees: 270, label: "On its other side", hint: "Turned a quarter the other way", portrait: true },
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
            <span className={option.portrait ? "orient-screen tall" : "orient-screen"} />
            {option.label}
          </button>
        ))}
      </div>

      <p className="hint">
        A quarter turn changes the grid as well as the picture: this panel holds
        fewer columns and more rows on its side, and widgets that no longer fit
        are dropped from the page. The screen flashes once when this changes,
        because every pixel means something different afterwards.
      </p>
    </section>
  );
}
