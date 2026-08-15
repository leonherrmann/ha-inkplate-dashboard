import { useCallback, useEffect, useState } from "react";

import DeviceSummary from "./DeviceStats.jsx";
import DeviceTab from "./DeviceTab.jsx";
import Inspector from "./Inspector.jsx";
import Panel from "./Panel.jsx";
import PageTabs from "./PageTabs.jsx";
import QueueTab from "./QueueTab.jsx";
import * as api from "./api.js";
import { DEFAULT_SNAP, SNAP_STEPS, ZOOM_LEVELS, newId } from "./layout.js";

const TABS = [
  { id: "design", label: "Design" },
  { id: "queue", label: "Queue" },
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
  const [tab, setTab] = useState("design");
  const [activePageId, setActivePageId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [snapStep, setSnapStep] = useState(DEFAULT_SNAP);
  const [zoom, setZoom] = useState("fit");
  const [message, setMessage] = useState(null);

  const manifest = status?.manifest;
  const panel = manifest?.display || { width: 1280, height: 720 };

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
  }, []);

  const persist = useCallback(async (next) => {
    setLayout(next);
    try {
      await api.saveLayout(next);
    } catch (problem) {
      setMessage(problem.message);
    }
  }, []);

  // Widget edits always apply to the page being edited
  const updateWidgets = useCallback(
    (updater) => {
      setLayout((current) => {
        if (!current) return current;
        const next = structuredClone(current);
        const page = next.pages.find((candidate) => candidate.id === activePage?.id);
        if (!page) return current;
        page.widgets = updater(page.widgets || []);
        persist(next);
        return next;
      });
    },
    [persist, activePage]
  );

  const addWidget = (type) => {
    const widget = { id: newId(), type: type.type, x: 0, y: 0, options: {} };
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
                  {SNAP_STEPS.map(({ label, step }) => (
                    <button
                      key={label}
                      className={step === snapStep ? "chip active" : "chip"}
                      onClick={() => setSnapStep(step)}
                    >
                      {label}
                      <small>{step}px</small>
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
                selectedId={selectedId}
                onSelect={setSelectedId}
                onMove={moveWidget}
                snapStep={snapStep}
                zoom={zoom}
              />
            </main>

            <aside className="palette">
              <h2>Add widget</h2>
              <div className="palette-items">
                {(manifest?.widgets || []).map((type) => (
                  <button key={type.type} onClick={() => addWidget(type)}>
                    <span>{type.label}</span>
                    <small>{type.size_from ? "varies" : `${type.width}×${type.height}`}</small>
                  </button>
                ))}
              </div>
            </aside>

            <Inspector
              widget={selected}
              manifest={manifest}
              entities={entities}
              onSetOption={setOption}
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
