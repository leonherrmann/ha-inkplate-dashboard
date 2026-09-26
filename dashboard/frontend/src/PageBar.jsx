import { PlusIcon, RedoIcon, UndoIcon, ViewIcon } from "./Icons.jsx";
import { Menu } from "./Popover.jsx";
import { CHIP_ROW_POSITIONS, SNAP_MODES, ZOOM_LEVELS } from "./layout.js";

// The canvas toolbar: one row, on a desktop above the canvas and on a phone
// below it.
//
// It used to carry fifteen controls and wrap onto a second line at 1440. What
// is left on the bar is what gets pressed: add, undo, redo, and which of the
// page's two arrangements is being edited. Everything that is set once and
// left -- snapping, zoom, the page's chip row -- is in the View menu. The four
// selection actions went to a bar floating beside the selected widget, which
// is where the eye already is.

// A segmented control inside the View menu. A group rather than a <label>: a
// label wrapping several buttons hands each of them the others' text as its
// accessible name.
function Choice({ label, value, options, onChange }) {
  return (
    <div className="menu-field" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="seg wide">
        {options.map((option) => (
          <button
            key={String(option.value)}
            className={option.value === value ? "active" : undefined}
            onClick={() => onChange(option.value)}
            aria-pressed={option.value === value}
            title={option.title}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ViewMenu({
  narrow,
  snapMode,
  onSnap,
  zoom,
  onZoom,
  chipRow,
  onChipRow,
  shape,
  onShape,
  shapeSwitchable,
  shapeInherited,
}) {
  return (
    <Menu
      label="View and page options"
      text={narrow ? undefined : "View"}
      icon={<ViewIcon size={15} />}
      buttonClassName={narrow ? "icon-button" : "bar-button"}
    >
      {/* On a phone the arrangement is in here too; a desktop has room for it
          on the bar, where switching it is one click. */}
      {narrow && shapeSwitchable && (
        <Choice
          label="Arrangement"
          value={shape}
          onChange={onShape}
          options={[
            { value: "landscape", label: "Upright" },
            { value: "portrait", label: shapeInherited ? "Sideways (auto)" : "Sideways" },
          ]}
        />
      )}
      <Choice
        label="Snap"
        value={snapMode}
        onChange={onSnap}
        options={SNAP_MODES.map(({ id, label, hint }) => ({ value: id, label, title: `Snap to ${hint}` }))}
      />
      <Choice
        label="Zoom"
        value={zoom}
        onChange={onZoom}
        options={ZOOM_LEVELS.map(({ label, value }) => ({ value, label }))}
      />
      <Choice
        label="Chip row on this page"
        value={chipRow}
        onChange={onChipRow}
        options={CHIP_ROW_POSITIONS.map(({ id, label }) => ({ value: id, label }))}
      />
    </Menu>
  );
}

export default function PageBar({
  narrow,
  onAddWidget,
  canAddWidget,
  undo,
  redo,
  canUndo,
  canRedo,
  shape,
  onShape,
  shapeSwitchable,
  shapeInherited,
  mod,
  ...view
}) {
  return (
    <div className="pagebar">
      <button className="primary pagebar-add" onClick={onAddWidget} disabled={!canAddWidget}>
        <PlusIcon size={14} width={2.2} />
        {narrow ? "Add" : "Add widget"}
      </button>

      {!narrow && shapeSwitchable && (
        <div className="seg" role="group" aria-label="Arrangement">
          <button
            className={shape === "landscape" ? "active" : undefined}
            onClick={() => onShape("landscape")}
            aria-pressed={shape === "landscape"}
            title="Edit the layout the panel shows standing upright"
          >
            Upright
          </button>
          <button
            className={shape === "portrait" ? "active" : undefined}
            onClick={() => onShape("portrait")}
            aria-pressed={shape === "portrait"}
            title={
              shapeInherited
                ? "Not laid out sideways yet: showing the upright layout fitted to it"
                : "Edit the layout the panel shows on its side"
            }
          >
            Sideways{shapeInherited ? " (auto)" : ""}
          </button>
        </div>
      )}

      <ViewMenu
        narrow={narrow}
        shape={shape}
        onShape={onShape}
        shapeSwitchable={shapeSwitchable}
        shapeInherited={shapeInherited}
        {...view}
      />

      <div className="pagebar-history" role="group" aria-label="History">
        <button
          className="icon-button"
          onClick={undo}
          disabled={!canUndo}
          title={`Undo (${mod}Z)`}
          aria-label="Undo"
        >
          <UndoIcon size={15} />
        </button>
        <button
          className="icon-button"
          onClick={redo}
          disabled={!canRedo}
          title={`Redo (⇧${mod}Z)`}
          aria-label="Redo"
        >
          <RedoIcon size={15} />
        </button>
      </div>
    </div>
  );
}
