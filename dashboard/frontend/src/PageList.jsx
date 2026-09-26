import { useEffect, useRef } from "react";

import { DEFAULT_CHIP_ROW } from "./layout.js";
import { chipRowLabel, effectiveDwell, formatDuration, formatDwell } from "./format.js";
import { Hint } from "./Popover.jsx";

// Which page you are editing, as a list in the editor's own column.
//
// It shows enough to choose between pages without opening them -- how many
// widgets, where the chip row sits, which one the device has up -- but nothing
// that configures a page. Ordering, dwell and queueing live on the Pages
// screen, because they are properties of the rotation rather than of the page
// you happen to be drawing on. Adding one goes there too, which is why this
// only links across.
//
// A page's time on screen is only shown when it has one of its own. It used to
// say "default" on every page that did not, which read as "the default page".

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
        const widgets = page.widgets?.length || 0;

        return (
          <button
            key={page.id}
            className={`page-tab${active ? " active" : ""}${page.queued ? "" : " paused"}`}
            onClick={() => onSelect(page.id)}
            aria-current={active ? "true" : undefined}
          >
            <span className="page-tab-top">
              <b>{page.name || page.id}</b>
              {!page.queued ? (
                <span className="page-tab-dwell">paused</span>
              ) : page.dwell_seconds ? (
                <span className="page-tab-dwell" title="Time on screen">
                  {formatDwell(page.dwell_seconds)}
                </span>
              ) : null}
            </span>
            <span className="page-tab-meta">
              {live && <span className={pageLocked ? "dot yellow" : "dot blue"} />}
              {live ? (pageLocked ? "Held on the panel · " : "On the panel · ") : ""}
              {widgets} {widgets === 1 ? "widget" : "widgets"} · {chipRowLabel(chipRow)}
            </span>
          </button>
        );
      })}

      <button className="add-button" onClick={onAdd}>
        + Add page
      </button>

      {/* Only worth the space when something is actually cycling */}
      {rotating && !pageLocked && (
        <div className="rotation-note">
          Rotating {queued.length} pages · {formatDuration(cycle)} a loop
        </div>
      )}

      {pageLocked && (
        <div className="rotation-note">
          Rotation paused: the panel is held on one page.
          <Hint label="How to release it">
            Somebody held the right button on the panel. Hold it again, or use the
            padlock on the Pages screen, to let it rotate.
          </Hint>
        </div>
      )}
    </section>
  );
}

// The same choice on a phone: a strip of tabs over the canvas, which is one tap
// where the list was a scroll past the canvas. The chosen tab is brought into
// view, so a fifth page is never selected off screen.
export function PageTabs({ pages, activeId, currentPageId, onSelect }) {
  const strip = useRef(null);

  useEffect(() => {
    strip.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  return (
    <nav className="page-tabs" ref={strip} aria-label="Pages">
      {pages.map((page) => {
        const active = page.id === activeId;
        return (
          <button
            key={page.id}
            className={`page-chip${active ? " active" : ""}${page.queued ? "" : " paused"}`}
            onClick={() => onSelect(page.id)}
            aria-current={active ? "true" : undefined}
          >
            {page.id === currentPageId && <span className="dot blue" title="On the panel now" />}
            {page.name || page.id}
          </button>
        );
      })}
    </nav>
  );
}
