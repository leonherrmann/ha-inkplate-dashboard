import { DEFAULT_CHIP_ROW } from "./layout.js";
import { chipRowLabel, effectiveDwell, formatDuration, formatDwell } from "./format.js";

// Which page you are editing, as a list in the editor's own column.
//
// It shows enough to choose between pages without opening them -- how many
// widgets, where the chip row sits, which one the device has up -- but nothing
// that configures a page. Ordering, dwell, queueing and the chip row all live
// on the Pages screen, because they are properties of the rotation rather than
// of the page you happen to be drawing on. Adding one goes there too, which is
// why this only links across.
//
// The page bar above the canvas keeps its select for narrow screens, where this
// column has stacked below the canvas and is no longer the quickest way across.

export default function PageList({
  pages,
  activeId,
  currentPageId,
  pageLocked,
  rotation,
  onSelect,
  onAdd,
}) {
  const queued = pages.filter((page) => page.queued);
  const cycle = queued.reduce((sum, page) => sum + effectiveDwell(page, rotation), 0);
  const rotating = Boolean(rotation?.enabled) && queued.length > 1;

  return (
    <section className="card page-list-card">
      <div className="page-list-head">
        <span className="eyebrow">Pages</span>
        <span>{pages.length}</span>
      </div>

      {pages.map((page) => {
        const active = page.id === activeId;
        const live = page.id === currentPageId;
        const chipRow = page.chip_row || DEFAULT_CHIP_ROW;

        return (
          <button
            key={page.id}
            className={`page-tab${active ? " active" : ""}${page.queued ? "" : " paused"}`}
            onClick={() => onSelect(page.id)}
            aria-current={active ? "true" : undefined}
          >
            <span className="page-tab-top">
              {/* Solid when the page is in the rotation, hollow when it is kept
                  but never comes up on its own. */}
              <span
                className={
                  active
                    ? "dot"
                    : page.queued
                      ? live
                        ? "dot blue"
                        : "dot teal"
                      : "dot empty"
                }
                style={active ? { background: "#fff" } : undefined}
              />
              <b>{page.name || page.id}</b>
              <span className="page-tab-dwell">
                {page.queued ? formatDwell(page.dwell_seconds) : "not queued"}
              </span>
            </span>
            <span className="page-tab-meta">
              {page.widgets?.length || 0} widgets · {chipRowLabel(chipRow)}
              {live && (pageLocked ? " · held here" : " · showing now")}
            </span>
          </button>
        );
      })}

      <button className="add-button" onClick={onAdd}>
        + Add page
      </button>

      {/* Only worth the space when something is actually cycling. One queued
          page simply stays put, and saying "cycle 30 s" about it would be a lie
          the reader has to work out for themselves. */}
      {rotating && !pageLocked && (
        <div className="rotation-note">
          <b>Rotation on</b>
          <br />
          {queued.length} pages queued · cycle {formatDuration(cycle)}
        </div>
      )}

      {pageLocked && (
        <div className="rotation-note">
          <b>Held on the panel</b>
          <br />
          Somebody locked the panel to this page, so rotation is not running.
          Hold the right button on the panel to release it.
        </div>
      )}
    </section>
  );
}
