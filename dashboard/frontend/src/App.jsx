import { useCallback, useEffect, useState } from "react";

import DeviceModal from "./DeviceModal.jsx";
import DeviceSummary from "./DeviceStats.jsx";
import Inspector from "./Inspector.jsx";
import Panel from "./Panel.jsx";
import * as api from "./api.js";
import { DEFAULT_SNAP, SNAP_STEPS, ZOOM_LEVELS, newId } from "./layout.js";

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
  const [selectedId, setSelectedId] = useState(null);
  const [snapStep, setSnapStep] = useState(DEFAULT_SNAP);
  const [zoom, setZoom] = useState("fit");
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [message, setMessage] = useState(null);

  const manifest = status?.manifest;
  const panel = manifest?.display || { width: 1280, height: 720 };
  const widgets = layout?.pages?.[0]?.widgets || [];
  const selected = widgets.find((widget) => widget.id === selectedId) || null;

  // Both timestamps come from the backend, so a clock skewed on this machine
  // cannot make "last seen" nonsense.
  const lastSeenAge =
    status?.last_seen && status?.server_time
      ? Math.max(0, status.server_time - status.last_seen)
      : null;

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

  const updateWidgets = useCallback(
    (updater) => {
      setLayout((current) => {
        if (!current) return current;
        const next = structuredClone(current);
        next.pages[0].widgets = updater(next.pages[0].widgets);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const setSleep = (next) => {
    setLayout((current) => {
      if (!current) return current;
      const updated = structuredClone(current);
      updated.sleep = next;
      persist(updated);
      return updated;
    });
  };

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

  const push = async () => {
    try {
      const result = await api.pushLayout();
      setMessage(`Pushed version ${result.version}`);
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

  const unpushed = status?.applied && status.draft_version > status.applied.version;

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
          onOpen={() => setDeviceOpen(true)}
        />

        <div className="actions">
          <button className={unpushed ? "primary nudge" : "primary"} onClick={push}>
            Push{unpushed ? " •" : ""}
          </button>
        </div>
      </header>

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

      <div className="workspace">
        <main>
          {/* View controls sit with the canvas they act on */}
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

      {deviceOpen && (
        <DeviceModal
          status={status}
          lastSeenAge={lastSeenAge}
          sleep={layout.sleep}
          onSleepChange={setSleep}
          onRefresh={() => api.refreshDevice().then(() => setMessage("Refresh sent"))}
          onClose={() => setDeviceOpen(false)}
        />
      )}
    </div>
  );
}
