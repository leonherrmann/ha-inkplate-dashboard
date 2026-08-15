// The rotation: which pages take part, in what order, and for how long.
//
// The device holds the queue and advances on its own timer, so rotation carries
// on when the add-on, broker or WiFi is not there -- and it has to, since a
// sleeping device could not be driven from outside at all.

export default function QueueTab({ layout, currentPageId, onChange, onShowPage }) {
  const rotation = layout.rotation || {};
  const pages = layout.pages || [];
  const queued = pages.filter((page) => page.queued);

  const setRotation = (key, value) =>
    onChange({ ...layout, rotation: { ...rotation, [key]: value } });

  const setPage = (id, changes) =>
    onChange({
      ...layout,
      pages: pages.map((page) => (page.id === id ? { ...page, ...changes } : page)),
    });

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= pages.length) return;
    const next = [...pages];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...layout, pages: next });
  };

  const remove = (id) => {
    if (pages.length <= 1) return;
    onChange({ ...layout, pages: pages.filter((page) => page.id !== id) });
  };

  const totalCycle = queued.reduce(
    (sum, page) => sum + (page.dwell_seconds || rotation.default_dwell_seconds || 60),
    0
  );

  return (
    <div className="tab-panel">
      <section className="card">
        <h2>Rotation</h2>

        <label className="switch">
          <input
            type="checkbox"
            checked={Boolean(rotation.enabled)}
            onChange={(event) => setRotation("enabled", event.target.checked)}
          />
          <span>Cycle through the queued pages</span>
        </label>

        <label className="field">
          <span>Default time on each page</span>
          <select
            value={String(rotation.default_dwell_seconds ?? 60)}
            onChange={(event) => setRotation("default_dwell_seconds", Number(event.target.value))}
          >
            <option value="15">15 seconds</option>
            <option value="30">30 seconds</option>
            <option value="60">1 minute</option>
            <option value="300">5 minutes</option>
            <option value="900">15 minutes</option>
            <option value="3600">1 hour</option>
          </select>
        </label>

        {rotation.enabled && queued.length < 2 && (
          <p className="hint">
            Rotation needs at least two queued pages; with one it simply stays put.
          </p>
        )}
        {rotation.enabled && queued.length > 1 && (
          <p className="hint">
            A full cycle takes {formatDuration(totalCycle)}. Every page change is a full
            refresh, since pages differ too much for a partial one to come out clean.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Pages</h2>
        <ol className="queue-list">
          {pages.map((page, index) => (
            <li key={page.id} className={page.queued ? "queue-row" : "queue-row paused"}>
              <div className="queue-order">
                <button
                  className="icon-button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  className="icon-button"
                  onClick={() => move(index, 1)}
                  disabled={index === pages.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
              </div>

              <div className="queue-main">
                <input
                  className="queue-name"
                  value={page.name || ""}
                  onChange={(event) => setPage(page.id, { name: event.target.value })}
                  placeholder={page.id}
                />
                <div className="queue-meta">
                  {page.widgets?.length || 0} widgets
                  {page.id === currentPageId && <b> · on the device now</b>}
                </div>
              </div>

              <label className="queue-dwell">
                <span>Time</span>
                <select
                  value={String(page.dwell_seconds || 0)}
                  onChange={(event) =>
                    setPage(page.id, { dwell_seconds: Number(event.target.value) })
                  }
                  disabled={!page.queued}
                >
                  <option value="0">Default</option>
                  <option value="15">15s</option>
                  <option value="30">30s</option>
                  <option value="60">1m</option>
                  <option value="300">5m</option>
                  <option value="900">15m</option>
                </select>
              </label>

              <label className="switch queue-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(page.queued)}
                  onChange={(event) => setPage(page.id, { queued: event.target.checked })}
                />
                <span>In queue</span>
              </label>

              <div className="queue-actions">
                <button onClick={() => onShowPage(page.id)} title="Show this page on the device now">
                  Show
                </button>
                <button
                  className="icon-button"
                  onClick={() => remove(page.id)}
                  disabled={pages.length <= 1}
                  aria-label="Delete page"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ol>

        <p className="hint">
          A page left out of the queue is kept but never shown on its own. You can still
          put it up with Show, or from a Home Assistant automation.
        </p>
      </section>
    </div>
  );
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
