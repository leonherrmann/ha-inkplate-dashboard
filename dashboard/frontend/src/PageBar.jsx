// Which page you are editing, and the view controls for the canvas.
//
// These were two stacked bars -- a strip of page tabs, then a toolbar of four
// bordered groups holding twelve chips -- which on a phone was 126px of chrome
// above a canvas that had barely 200px left. They are one bar now.
//
// What went: snap and zoom, which describe how the canvas behaves rather than
// what is on it; and the chip row buttons, which are a page setting but one you
// can only judge by watching the canvas. All three are docked to the canvas
// itself. What is left is the page you are editing and the three actions that
// change it.

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
  duplicate,
  canUndo,
  canRedo,
  canDuplicate,
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

      <button className="primary pagebar-add" onClick={onAddWidget} disabled={!canAddWidget}>
        Add widget
      </button>

      {/* Adding a *page* is not here. It is one button in the Pages tab, which
          is where every other thing you can do to a page already lives; a "+"
          beside the page menu was a second place to do it and the less
          discoverable of the two. */}

      <div className="pagebar-edit" role="group" aria-label="Edit">
        <button className="icon-button" onClick={undo} disabled={!canUndo} title={`Undo (${mod}Z)`} aria-label="Undo">
          ↶
        </button>
        <button className="icon-button" onClick={redo} disabled={!canRedo} title={`Redo (⇧${mod}Z)`} aria-label="Redo">
          ↷
        </button>
        <button
          className="icon-button"
          onClick={duplicate}
          disabled={!canDuplicate}
          title={canDuplicate ? `Duplicate (${mod}D)` : "Select a widget first"}
          aria-label="Duplicate"
        >
          ⧉
        </button>
      </div>

    </div>
  );
}
