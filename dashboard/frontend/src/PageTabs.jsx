// Which page you are editing. Deliberately a thin strip above the canvas: it is
// navigation, not configuration, so everything about how a page behaves lives
// in the Queue tab instead.

export default function PageTabs({ pages, activeId, currentPageId, onSelect, onAdd }) {
  return (
    <div className="page-tabs">
      {pages.map((page) => (
        <button
          key={page.id}
          className={page.id === activeId ? "page-tab active" : "page-tab"}
          onClick={() => onSelect(page.id)}
        >
          {/* A dot marks the page the device is actually showing right now */}
          {page.id === currentPageId && <span className="page-tab-live" title="On the device now" />}
          {page.name || page.id}
          {!page.queued && <small title="Not in the rotation">paused</small>}
        </button>
      ))}
      <button className="page-tab add" onClick={onAdd} title="Add a page">
        +
      </button>
    </div>
  );
}
