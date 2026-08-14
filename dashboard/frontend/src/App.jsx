import { useCallback, useEffect, useMemo, useState } from "react";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import WidgetPreview from "./WidgetPreview.jsx";
import * as api from "./api.js";

// Rendered at half the panel's 1280x720 so the editor fits on a laptop screen
const SCALE = 0.5;

function useStatus() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      setStatus(await api.getStatus());
      setError(null);
    } catch (problem) {
      setError(problem.message);
    }
  }, []);

  useEffect(() => {
    reload();
    const timer = setInterval(reload, 5000);
    return () => clearInterval(timer);
  }, [reload]);

  return { status, error, reload };
}

export default function App() {
  const { status, error: statusError } = useStatus();
  const [layout, setLayout] = useState(null);
  const [entities, setEntities] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState(null);

  const manifest = status?.manifest;
  const grid = manifest?.grid || { cols: 16, rows: 9, cell: 80 };

  useEffect(() => {
    api.getLayout().then(setLayout).catch((problem) => setMessage(problem.message));
    api.getEntities().then(setEntities).catch(() => setEntities([]));
  }, []);

  const widgets = layout?.pages?.[0]?.widgets || [];

  const persist = useCallback(async (next) => {
    setLayout(next);
    try {
      await api.saveLayout(next);
    } catch (problem) {
      setMessage(problem.message);
    }
  }, []);

  const updateWidgets = useCallback(
    (nextWidgets) => {
      const next = structuredClone(layout);
      next.pages[0].widgets = nextWidgets;
      persist(next);
    },
    [layout, persist]
  );

  const gridLayout = useMemo(
    () =>
      widgets.map((widget, index) => {
        const type = manifest?.widgets?.find((candidate) => candidate.type === widget.type);
        return {
          i: String(index),
          x: widget.col,
          y: widget.row,
          w: type?.span?.cols || 2,
          h: type?.span?.rows || 2,
          // The firmware sizes widgets itself; the grid only positions them
          static: false,
          isResizable: false,
        };
      }),
    [widgets, manifest]
  );

  const onLayoutChange = (next) => {
    const moved = widgets.map((widget, index) => {
      const position = next.find((item) => item.i === String(index));
      return position ? { ...widget, col: position.x, row: position.y } : widget;
    });
    updateWidgets(moved);
  };

  const addWidget = (type) => {
    updateWidgets([...widgets, { type: type.type, col: 0, row: 0, options: {} }]);
    setSelected(widgets.length);
  };

  const removeWidget = (index) => {
    updateWidgets(widgets.filter((_, position) => position !== index));
    setSelected(null);
  };

  const setOption = (index, key, value) => {
    updateWidgets(
      widgets.map((widget, position) =>
        position === index ? { ...widget, options: { ...widget.options, [key]: value } } : widget
      )
    );
  };

  const push = async () => {
    try {
      const result = await api.pushLayout();
      setMessage(`Pushed version ${result.version}`);
    } catch (problem) {
      setMessage(problem.message);
    }
  };

  if (statusError) {
    return <div className="error">Cannot reach the add-on backend: {statusError}</div>;
  }
  if (!layout) {
    return <div className="loading">Loading…</div>;
  }

  const selectedWidget = selected !== null ? widgets[selected] : null;
  const selectedType = manifest?.widgets?.find((type) => type.type === selectedWidget?.type);

  return (
    <div className="app">
      <header>
        <h1>Inkplate Dashboard</h1>
        <div className="status">
          <span className={status?.online ? "dot online" : "dot offline"} />
          {status?.online ? "Device online" : "Device offline"}
          {status?.applied ? ` · applied v${status.applied.version}` : ""}
          {` · draft v${status?.draft_version ?? 0}`}
        </div>
        <div className="actions">
          <button onClick={push}>Push to device</button>
          <button onClick={() => api.refreshDevice()}>Force refresh</button>
        </div>
      </header>

      {message && <div className="message" onClick={() => setMessage(null)}>{message}</div>}

      {!manifest && (
        <div className="message">
          Waiting for the device to publish its widget manifest. It does that at boot —
          check that it is powered on and using the same MQTT broker.
        </div>
      )}

      <div className="workspace">
        <aside className="palette">
          <h2>Widgets</h2>
          {(manifest?.widgets || []).map((type) => (
            <button key={type.type} onClick={() => addWidget(type)}>
              {type.label}
              <small>
                {type.span.cols}×{type.span.rows}
              </small>
            </button>
          ))}
        </aside>

        <main>
          <div
            className="panel"
            style={{
              width: grid.cols * grid.cell * SCALE,
              height: grid.rows * grid.cell * SCALE,
              backgroundSize: `${grid.cell * SCALE}px ${grid.cell * SCALE}px`,
            }}
          >
            <GridLayout
              className="layout"
              layout={gridLayout}
              cols={grid.cols}
              maxRows={grid.rows}
              rowHeight={grid.cell * SCALE}
              width={grid.cols * grid.cell * SCALE}
              margin={[0, 0]}
              containerPadding={[0, 0]}
              compactType={null}
              preventCollision
              onLayoutChange={onLayoutChange}
            >
              {widgets.map((widget, index) => (
                <div
                  key={String(index)}
                  className={selected === index ? "widget selected" : "widget"}
                  onClick={() => setSelected(index)}
                >
                  <WidgetPreview type={widget.type} options={widget.options} />
                </div>
              ))}
            </GridLayout>
          </div>
        </main>

        <aside className="inspector">
          <h2>Options</h2>
          {!selectedWidget && <p className="hint">Select a widget on the grid.</p>}
          {selectedWidget && (
            <>
              <h3>{selectedType?.label || selectedWidget.type}</h3>
              {(selectedType?.options || []).map((option) => (
                <label key={option.key}>
                  {option.label}
                  {option.type === "entity" ? (
                    <select
                      value={selectedWidget.options[option.key] || ""}
                      onChange={(event) => setOption(selected, option.key, event.target.value)}
                    >
                      <option value="">— none —</option>
                      {entities
                        .filter((entity) => !option.filter || entity.entity_id.startsWith(`${option.filter}.`))
                        .map((entity) => (
                          <option key={entity.entity_id} value={entity.entity_id}>
                            {entity.name}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <input
                      value={selectedWidget.options[option.key] || ""}
                      onChange={(event) => setOption(selected, option.key, event.target.value)}
                      placeholder={option.filter || ""}
                    />
                  )}
                </label>
              ))}
              {(selectedType?.options || []).length === 0 && (
                <p className="hint">This widget has no options.</p>
              )}
              <button className="danger" onClick={() => removeWidget(selected)}>
                Remove widget
              </button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
