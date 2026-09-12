import {
  BackIcon,
  DuplicateIcon,
  FrontIcon,
  RedoIcon,
  TrashIcon,
  UndoIcon,
} from "./Icons.jsx";
import { CHIP_ROW_POSITIONS, SNAP_MODES, ZOOM_LEVELS } from "./layout.js";

// The canvas toolbar -- design 1a.
//
// It reads left to right as three groups with different scopes: how the canvas
// behaves (snap, zoom), what to do with the thing you have selected (front,
// back, duplicate, delete), and what to do with the page as a whole (undo,
// redo, add). A divider separates the first two because only the second group
// depends on there being a selection at all; the third is pushed to the far
// edge, away from anything destructive.
//
// The selection actions were only in the inspector before, which meant sending
// a widget behind another took a trip to a panel on the far side of the canvas
// -- and on a phone, to a panel below the fold. They are on the selection's own
// side of the screen now.
//
// Snap and zoom came up from a dock under the canvas. They were put there to
// keep view settings off a toolbar that edits the layout, which the design
// disagrees with: it has one bar, and a divider does the separating. The dock
// below the canvas is now the status line the design draws there instead.
//
// Not in the design, kept because the app needs it: the page select, which
// earns its place only on a narrow screen where the pages column has stacked
// out of reach, and Add widget, which the design never draws a home for.

export default function PageBar({
  pages,
  activeId,
  currentPageId,
  pageLocked,
  onSelect,
  onAddWidget,
  canAddWidget,
  undo,
  redo,
  canUndo,
  canRedo,
  snapMode,
  onSnap,
  zoom,
  onZoom,
  chipRow,
  onChipRow,
  hasSelection,
  onFront,
  onBack,
  onDuplicate,
  onDelete,
  mod,
}) {
  const active = pages.find((page) => page.id === activeId) || pages[0];

  return (
    <div className="pagebar">
      {/* A select on every width. The strip of tabs it replaces already
          scrolled horizontally once there were four pages, so on a phone the
          page you wanted was as likely to be off-screen as not -- and a select
          is the control a phone renders as a native list you can actually
          read. The live dot moves to the label beside it. */}
      <div className="pagebar-page">
        <label className="pagebar-select">
          <span className="sr-only">Page</span>
          <select value={active?.id || ""} onChange={(event) => onSelect(event.target.value)}>
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.name || page.id}
                {!page.queued ? " (not in rotation)" : ""}
              </option>
            ))}
          </select>
        </label>
        {active?.id === currentPageId && (
          <span
            className="pagebar-live"
            title={
              pageLocked
                ? "On the device now, and held there: somebody has locked the panel to this page. Hold the right button on the panel to release it."
                : "On the device now"
            }
          >
            {pageLocked ? "live · locked" : "live"}
          </span>
        )}
      </div>

      <div className="seg" role="group" aria-label="Snap">
        {SNAP_MODES.map(({ id, label, hint }) => (
          <button
            key={id}
            className={id === snapMode ? "active" : undefined}
            onClick={() => onSnap(id)}
            title={`Snap to ${hint}`}
            aria-pressed={id === snapMode}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="seg" role="group" aria-label="Zoom">
        {ZOOM_LEVELS.map(({ label, value }) => (
          <button
            key={label}
            className={value === zoom ? "active" : undefined}
            onClick={() => onZoom(value)}
            aria-pressed={value === zoom}
          >
            {label}
          </button>
        ))}
      </div>

      {/* A menu rather than a third segment: the bar already carries two, and a
          third set of pills makes three rows of near-identical chips that have
          to be read before one can be told from another. It is also the only
          one of the three that changes the layout rather than the view, so
          looking different is correct. */}
      <label className="bar-menu">
        <span className="sr-only">Chip row</span>
        <select value={chipRow} onChange={(event) => onChipRow(event.target.value)}>
          {CHIP_ROW_POSITIONS.map(({ id, label }) => (
            <option key={id} value={id}>
              Chips {label.toLowerCase()}
            </option>
          ))}
        </select>
      </label>

      <span className="bar-divider" aria-hidden="true" />

      {/* All four are disabled together rather than hidden: a bar whose buttons
          come and go as you click about the canvas moves everything beside them
          each time, and the gap left by a hidden group is a worse answer to
          "why can I not do this" than a dimmed button with a reason on it. */}
      <div className="pagebar-actions" role="group" aria-label="Selected widget">
        <button
          className="icon-button"
          onClick={onFront}
          disabled={!hasSelection}
          title={hasSelection ? "Bring to front" : "Select a widget first"}
          aria-label="Bring to front"
        >
          <FrontIcon size={15} />
        </button>
        <button
          className="icon-button"
          onClick={onBack}
          disabled={!hasSelection}
          title={hasSelection ? "Send to back" : "Select a widget first"}
          aria-label="Send to back"
        >
          <BackIcon size={15} />
        </button>
        <button
          className="icon-button"
          onClick={onDuplicate}
          disabled={!hasSelection}
          title={hasSelection ? `Duplicate (${mod}D)` : "Select a widget first"}
          aria-label="Duplicate"
        >
          <DuplicateIcon size={15} />
        </button>
        <button
          className="icon-button danger"
          onClick={onDelete}
          disabled={!hasSelection}
          title={hasSelection ? "Delete this widget" : "Select a widget first"}
          aria-label="Delete widget"
        >
          <TrashIcon size={15} />
        </button>
      </div>

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

      {/* Adding a *page* is not here. It is one button in the pages column and
          one on the Pages screen, which is where every other thing you can do
          to a page already lives. */}
      <button className="primary pagebar-add" onClick={onAddWidget} disabled={!canAddWidget}>
        Add widget
      </button>
    </div>
  );
}
