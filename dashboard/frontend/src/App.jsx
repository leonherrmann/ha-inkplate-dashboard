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
  CHIP_ROW_POSITIONS,
  DEFAULT_CHIP_ROW,
  DEFAULT_SNAP,
  FALLBACK_GRID,
  SNAP_MODES,
  ZOOM_LEVELS,
  cardBandTop,
  chipRowTop,
  defaultPosition,
  isChipType,
  isReachable,
  newId,
  placeWidget,
  widgetSize,
  widgetType,
} from "./layout.js";

const TABS = [
  { id: "design", label: "Design" },
  { id: "queue", label: "Queue" },
  { id: "images", label: "Images" },
  { id: "device", label: "Device" },
];

// What the panel is showing versus what is in the editor, in words the reader
// can act on. The version numbers behind it stay internal; they are noise on
// screen. The distinctions are the point: waiting on a sleeping panel and
// having forgotten to press Push call for opposite responses, and neither is
// the same as the add-on genuinely not knowing.
function syncState(status) {
  if (!status) {
    return { tone: "unknown", label: "Unknown", detail: "Waiting for the add-on." };
  }
  if (!status.draft_pushed) {
    return {
      tone: "pending",
      label: "Changes not pushed",
      detail: "Edits are saved here but have not been sent to the device.",
      // The only state pressing Push actually resolves
      nudge: true,
    };
  }

  const applied = status.applied;
  if (!applied) {
    return {
      tone: "unknown",
      label: "Unknown",
      detail: "The device has not reported which layout it is showing.",
    };
  }
  if (applied.ok === false) {
    return {
      tone: "bad",
      label: "Device refused it",
      detail: applied.error || "The device could not build the layout it was sent.",
    };
  }
  // Sent, but the panel has not confirmed that version. Normal for a device in
  // its night sleep, which collects the push when it next wakes.
  if (applied.version !== status.pushed_version) {
    return {
      tone: "pending",
      label: "Awaiting device",
      detail: "The layout was sent; the device has not confirmed it yet.",
    };
  }
  return { tone: "ok", label: "In sync", detail: "The panel is showing this layout." };
}

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
  // Where the chip row sits is a layout choice, not a device one -- the
  // firmware draws at the pixels it is given and never derives a row.
  const chipRow = layout?.chip_row || DEFAULT_CHIP_ROW;

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

  const sync = syncState(status);

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

  // A widget can end up beyond the panel edge -- an option can grow it, since an
  // image widget is the size of the picture chosen, and layouts arrive from
  // elsewhere. .panel-viewport clips anything outside, so a stranded widget is
  // invisible and cannot be selected, dragged or deleted: the editor offers no
  // way back. Anything unreachable is returned to the first cell.
  //
  // Waits for the manifest, because widget sizes come from it and guessing at
  // them would move widgets that were never stranded. Rescued positions are on
  // the panel by construction, so this cannot run a second time on its own
  // output.
  useEffect(() => {
    if (!layout || !manifest) return;

    // Counted before anything is copied: the status poll re-runs this
    // constantly, and cloning the layout each time to discover nothing is wrong
    // would be pure waste.
    const stranded = (page) =>
      (page.widgets || []).filter(
        (widget) => !isReachable(widget, widgetSize(manifest, widget, uploads), panel)
      ).length;

    const rescued = (layout.pages || []).reduce((total, page) => total + stranded(page), 0);
    if (rescued === 0) return;

    const next = structuredClone(layout);
    for (const page of next.pages || []) {
      for (const widget of page.widgets || []) {
        if (isReachable(widget, widgetSize(manifest, widget, uploads), panel)) continue;
        const home = defaultPosition(grid, {
          chipRow,
          isChip: isChipType(widgetType(manifest, widget)),
          panel,
        });
        widget.x = home.x;
        widget.y = home.y;
      }
    }

    setMessage(
      rescued === 1
        ? "A widget was off the panel and has been moved back to the top left."
        : `${rescued} widgets were off the panel and have been moved back to the top left.`
    );
    persist(next);
  }, [layout, manifest, uploads, panel.width, panel.height, grid.gap, persist]);

  const addWidget = (type) => {
    // Lands on the first cell rather than the very corner, so a new widget is
    // already grid-aligned and inside the edge gap. A chip lands in the chip
    // row, which is the only row it can occupy.
    const widget = {
      id: newId(),
      type: type.type,
      ...defaultPosition(grid, { chipRow, isChip: isChipType(type), panel }),
      options: {},
      ...(type.sizes?.length ? { size: type.sizes[0].id } : {}),
    };
    updateWidgets((current) => [...current, widget]);
    setSelectedId(widget.id);
  };

  // Moving the chip row moves the card band with it, so every widget has to
  // come along: leaving them put would misalign the whole layout by the height
  // of the row plus a gap. Chips are pinned to the row's new edge; cards shift
  // by the difference between the two band tops.
  const setChipRow = (next) => {
    if (next === chipRow) return;

    const shift = cardBandTop(grid, next) - cardBandTop(grid, chipRow);
    const chipY = chipRowTop(grid, panel, next);

    const moved = structuredClone(layout);
    moved.chip_row = next;
    for (const page of moved.pages || []) {
      for (const widget of page.widgets || []) {
        if (isChipType(widgetType(manifest, widget))) {
          widget.y = chipY;
        } else {
          widget.y += shift;
        }
      }
    }
    persist(moved);
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
        return {
          ...resized,
          ...placeWidget(resized, { x: 0, y: 0 }, snapMode, grid, widgetSize(manifest, resized, uploads), panel, {
            chipRow,
            isChip: isChipType(widgetType(manifest, resized)),
          }),
        };
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
      // ok:false is a broker that could not be reached. Not an HTTP failure, so
      // it arrives here rather than in the catch, and it is very much not a push.
      const result = await api.pushLayout();
      setMessage(
        result?.ok === false
          ? "Could not reach the MQTT broker, so nothing was sent."
          : "Sent to the device"
      );
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
          <span className={`sync ${sync.tone}`} title={sync.detail}>
            {sync.label}
          </span>
          {/* Nudged only when pressing Push is what would help. Waiting on a
              sleeping device is not something the button can hurry. */}
          <button className={sync.nudge ? "primary nudge" : "primary"} onClick={push}>
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
                  <span className="toolbar-label">Chip row</span>
                  {CHIP_ROW_POSITIONS.map(({ id, label }) => (
                    <button
                      key={id}
                      className={id === chipRow ? "chip active" : "chip"}
                      onClick={() => setChipRow(id)}
                    >
                      {label}
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
                chipRow={chipRow}
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
