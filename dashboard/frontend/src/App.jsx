import { useCallback, useEffect, useState } from "react";

import DeviceSummary from "./DeviceStats.jsx";
import DeviceTab from "./DeviceTab.jsx";
import ImagesTab from "./ImagesTab.jsx";
import Inspector from "./Inspector.jsx";
import Panel from "./Panel.jsx";
import PageTabs from "./PageTabs.jsx";
import QueueTab from "./QueueTab.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import * as api from "./api.js";
import {
  DEFAULT_SNAP,
  FALLBACK_GRID,
  SNAP_MODES,
  ZOOM_LEVELS,
  newId,
  placeWidget,
  widgetSize,
} from "./layout.js";

const TABS = [
  { id: "design", label: "Design" },
  { id: "queue", label: "Queue" },
  { id: "images", label: "Images" },
  { id: "device", label: "Device" },
];

function useStatus() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const reload = async () => {
      try {
        const next = await api.getStatus();
        if (!cancelled) {
          setStatus(next);
          setError(null);
        }
      } catch (problem) {
        if (!cancelled) setError(problem.message);
      }
    };
    reload();
    const timer = setInterval(reload, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return { status, error };
}

export default function App() {
  const { status, error: statusError } = useStatus();
  const [layout, setLayout] = useState(null);
  const [entities, setEntities] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [tab, setTab] = useState("design");
  const [activePageId, setActivePageId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [snapMode, setSnapMode] = useState(DEFAULT_SNAP);
  const [zoom, setZoom] = useState("fit");
  const [message, setMessage] = useState(null);

  const manifest = status?.manifest;
  const panel = manifest?.display || { width: 1280, height: 720 };
  // The firmware owns the grid and publishes it; this is only the fallback
  const grid = manifest?.grid || FALLBACK_GRID;

  const pages = layout?.pages || [];
  const activePage = pages.find((page) => page.id === activePageId) || pages[0] || null;
  const widgets = activePage?.widgets || [];
  const selected = widgets.find((widget) => widget.id === selectedId) || null;

  // Both timestamps come from the backend, so a clock skewed on this machine
  // cannot make "last seen" nonsense.
  const lastSeenAge =
    status?.last_seen && status?.server_time
      ? Math.max(0, status.server_time - status.last_seen)
      : null;

  // What the device is showing versus what is in the editor. The version
  // numbers behind this stay internal; they are noise on screen.
  const synced =
    status?.applied && status.draft_version === status.applied.version && status.applied.ok !== false;

  useEffect(() => {
    api.getLayout().then(setLayout).catch((problem) => setMessage(problem.message));
    api.getEntities().then(setEntities).catch(() => setEntities([]));
    // Named in the image widget's picker alongside the built-in icons
    api.getImages().then((data) => setUploads(data.images || [])).catch(() => setUploads([]));
  }, []);

  const persist = useCallback(async (next) => {
    setLayout(next);
    try {
      await api.saveLayout(next);
    } catch (problem) {
      setMessage(problem.message);
    }
  }, []);

  // Widget edits always apply to the page being edited.
  //
  // This used to do its work inside a setLayout updater, which also called
  // persist() -- so a state updater performed a network save and, through
  // persist, called setLayout again while React was still computing the first
  // one. React requires updaters to be pure and to return a value, not to
  // schedule more work; the effects of breaking that are timing-dependent and
  // surface as edits that appear not to take. The next layout is now built
  // first, then handed to persist, which is the only thing that sets it.
  const updateWidgets = useCallback(
    (updater) => {
      if (!layout) return;
      const next = structuredClone(layout);
      const page = next.pages.find((candidate) => candidate.id === activePage?.id);
      if (!page) return;
      page.widgets = updater(page.widgets || []);
      persist(next);
    },
    [layout, persist, activePage]
  );

  const addWidget = (type) => {
    // Lands on the first cell rather than the very corner, so a new widget is
    // already grid-aligned and inside the edge gap.
    const widget = {
      id: newId(),
      type: type.type,
      x: grid.gap,
      y: grid.gap,
      options: {},
      ...(type.sizes?.length ? { size: type.sizes[0].id } : {}),
    };
    updateWidgets((current) => [...current, widget]);
    setSelectedId(widget.id);
  };

  const moveWidget = (id, position) =>
    updateWidgets((current) =>
      current.map((widget) => (widget.id === id ? { ...widget, ...position } : widget))
    );

  const removeWidget = (id) => {
    updateWidgets((current) => current.filter((widget) => widget.id !== id));
    setSelectedId(null);
  };

  const setOption = (id, key, value) =>
    updateWidgets((current) =>
      current.map((widget) =>
        widget.id === id ? { ...widget, options: { ...widget.options, [key]: value } } : widget
      )
    );

  // Changing size changes the footprint, so the widget is re-placed to keep it
  // on the panel and, in grid mode, still on a cell.
  const setSize = (id, sizeId) =>
    updateWidgets((current) =>
      current.map((widget) => {
        if (widget.id !== id) return widget;
        const resized = { ...widget, size: sizeId };
        return { ...resized, ...placeWidget(resized, { x: 0, y: 0 }, snapMode, grid, widgetSize(manifest, resized, uploads), panel) };
      })
    );

  const addPage = () => {
    const id = `page_${newId().slice(0, 6)}`;
    const page = {
      id,
      name: `Page ${pages.length + 1}`,
      queued: true,
      dwell_seconds: 0,
      widgets: [],
    };
    persist({ ...layout, pages: [...pages, page] });
    setActivePageId(id);
    setSelectedId(null);
  };

  const push = async () => {
    try {
      await api.pushLayout();
      setMessage("Sent to the device");
    } catch (problem) {
      setMessage(problem.message);
    }
  };

  if (statusError) {
    return <div className="banner error">Cannot reach the add-on backend: {statusError}</div>;
  }
  if (!layout) {
    return <div className="banner">Loading…</div>;
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1>
            INKPLATE<em>DASHBOARD</em>
          </h1>
        </div>

        <DeviceSummary
          online={status?.online}
          stats={status?.stats}
          charging={status?.charging}
          lastSeenAge={lastSeenAge}
          onOpen={() => setTab("device")}
        />

        <div className="actions">
          <ThemeToggle />
          <span className={synced ? "sync ok" : "sync pending"}>
            {synced ? "In sync" : "Not sent yet"}
          </span>
          <button className={synced ? "primary" : "primary nudge"} onClick={push}>
            Push
          </button>
        </div>
      </header>

      <nav className="tabs main-tabs">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            className={tab === entry.id ? "tab active" : "tab"}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {message && (
        <div className="banner" onClick={() => setMessage(null)} role="status">
          {message}
        </div>
      )}

      {!manifest && (
        <div className="banner">
          Waiting for the device to publish its widget manifest. It does that at boot, so
          power it on and check it is using the same MQTT broker.
        </div>
      )}

      {tab === "design" && (
        <>
          <PageTabs
            pages={pages}
            activeId={activePage?.id}
            currentPageId={status?.current_page}
            onSelect={(id) => {
              setActivePageId(id);
              setSelectedId(null);
            }}
            onAdd={addPage}
          />

          <div className="workspace">
            <main>
              <div className="toolbar">
                <div className="toolbar-group">
                  <span className="toolbar-label">Snap</span>
                  {SNAP_MODES.map(({ id, label, hint }) => (
                    <button
                      key={id}
                      className={id === snapMode ? "chip active" : "chip"}
                      onClick={() => setSnapMode(id)}
                    >
                      {label}
                      <small>{hint}</small>
                    </button>
                  ))}
                </div>

                <div className="toolbar-group">
                  <span className="toolbar-label">Zoom</span>
                  {ZOOM_LEVELS.map(({ label, value }) => (
                    <button
                      key={label}
                      className={value === zoom ? "chip active" : "chip"}
                      onClick={() => setZoom(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <Panel
                panel={panel}
                widgets={widgets}
                manifest={manifest}
                uploads={uploads}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onMove={moveWidget}
                snapMode={snapMode}
                grid={grid}
                zoom={zoom}
              />
            </main>

            <aside className="palette">
              <h2>Add widget</h2>
              <div className="palette-items">
                {(manifest?.widgets || []).map((type) => (
                  <button key={type.type} onClick={() => addWidget(type)}>
                    <span>{type.label}</span>
                    <small>
                      {type.size_from || !type.width
                        ? "varies"
                        : `${type.width}×${type.height}`}
                    </small>
                  </button>
                ))}
              </div>
            </aside>

            <Inspector
              widget={selected}
              manifest={manifest}
              entities={entities}
              uploads={uploads}
              onSetOption={setOption}
              onSetSize={setSize}
              onRemove={removeWidget}
              onClose={() => setSelectedId(null)}
            />
          </div>
        </>
      )}

      {tab === "queue" && (
        <QueueTab
          layout={layout}
          currentPageId={status?.current_page}
          onChange={persist}
          onShowPage={(id) =>
            api.showPage(id).then(() => setMessage(`Showing ${id} on the device`))
          }
        />
      )}

      {tab === "images" && (
        <ImagesTab
          grid={grid}
          panel={panel}
          onMessage={(text) => {
            setMessage(text);
            api.getImages().then((data) => setUploads(data.images || [])).catch(() => {});
          }}
        />
      )}

      {tab === "device" && (
        <DeviceTab
          status={status}
          lastSeenAge={lastSeenAge}
          sleep={layout.sleep}
          onSleepChange={(next) => persist({ ...layout, sleep: next })}
          onRefresh={() => api.refreshDevice().then(() => setMessage("Refresh sent"))}
        />
      )}
    </div>
  );
}
