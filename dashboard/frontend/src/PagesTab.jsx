import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import PageThumb from "./PageThumb.jsx";
import { CHIP_ROW_POSITIONS, DEFAULT_CHIP_ROW } from "./layout.js";

// The pages of the dashboard: what they are called, what order they come in,
// which of them the panel cycles through, and for how long.
//
// This was called "Queue", which named one property of a page rather than the
// thing itself -- so the tab that holds every page setting was named after a
// checkbox on it. Reordering was a pair of arrow buttons per row, which is
// eleven clicks to move the last page to the front.
//
// The device holds the rotation and advances on its own timer, so it carries on
// when the add-on, broker or WiFi is not there -- and it has to, since a
// sleeping device could not be driven from outside at all.

const DWELLS = [
  { value: 0, label: "Default" },
  { value: 15, label: "15 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 300, label: "5 minutes" },
  { value: 900, label: "15 minutes" },
];

function Row({ page, index, count, currentPageId, pageLocked, manifest, uploads, panel, onSet, onShow, onRemove, onEdit }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: page.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`page-row${page.queued ? "" : " paused"}${isDragging ? " dragging" : ""}`}
    >
      {/* The handle is its own element rather than the whole row: the row holds
          a text field and a set of buttons, and a drag that starts anywhere
          would fight every one of them. */}
      <button
        className="page-grip"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${page.name || page.id}, currently ${index + 1} of ${count}`}
      >
        <span aria-hidden="true">⠿</span>
      </button>

      <PageThumb page={page} manifest={manifest} uploads={uploads} panel={panel} />

      <div className="page-row-main">
        <input
          className="page-row-name"
          value={page.name || ""}
          onChange={(event) => onSet({ name: event.target.value })}
          placeholder={page.id}
          aria-label="Page name"
        />
        <div className="page-row-meta">
          {page.widgets?.length || 0} {page.widgets?.length === 1 ? "widget" : "widgets"}
          {page.id === currentPageId && (
            <b> · on the device now{pageLocked ? ", locked there" : ""}</b>
          )}
        </div>
      </div>

      <div className="page-row-controls">
        <label className="page-row-queued">
          <input
            type="checkbox"
            checked={Boolean(page.queued)}
            onChange={(event) => onSet({ queued: event.target.checked })}
          />
          <span>In rotation</span>
        </label>

        <select
          className="page-row-dwell"
          value={String(page.dwell_seconds || 0)}
          onChange={(event) => onSet({ dwell_seconds: Number(event.target.value) })}
          disabled={!page.queued}
          aria-label="Time on this page"
        >
          {DWELLS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>

      <div className="page-row-actions">
        <button onClick={onEdit} title="Edit this page's layout">
          Edit
        </button>
        <button onClick={onShow} title="Show this page on the device now">
          Show
        </button>
        <button
          className="icon-button danger"
          onClick={onRemove}
          disabled={count <= 1}
          aria-label={`Delete ${page.name || page.id}`}
          title={count <= 1 ? "A dashboard needs at least one page" : "Delete this page"}
        >
          ×
        </button>
      </div>

      {/* Per page, not per dashboard: turning it off gives this page's cards
          the row's height, so a full-screen clock page can drop it while a
          dashboard page keeps it. It used to sit in the canvas toolbar, where
          it was the only page setting among three view settings. */}
      <div className="page-row-chips" role="group" aria-label="Chip row">
        <span>Chip row</span>
        {CHIP_ROW_POSITIONS.map(({ id, label }) => (
          <button
            key={id}
            className={(page.chip_row || DEFAULT_CHIP_ROW) === id ? "chip active" : "chip"}
            onClick={() => onSet({ chip_row: id })}
          >
            {label}
          </button>
        ))}
      </div>
    </li>
  );
}

export default function PagesTab({
  layout,
  currentPageId,
  pageLocked,
  manifest,
  uploads,
  panel,
  onChange,
  onShowPage,
  onEditPage,
  onAddPage,
  onSetChipRow,
}) {
  const rotation = layout.rotation || {};
  const pages = layout.pages || [];
  const queued = pages.filter((page) => page.queued);

  // Same activation constraints as the canvas, and for the same reasons: below
  // the threshold the gesture stays a click, so a tap still lands on the handle
  // and a swipe still scrolls the page on a phone.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    // The arrow buttons this replaced were the only keyboard route to
    // reordering, so the handle has to offer one.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const setRotation = (key, value) =>
    onChange({ ...layout, rotation: { ...rotation, [key]: value } });

  const setPage = (id, changes) =>
    onChange({
      ...layout,
      pages: pages.map((page) => (page.id === id ? { ...page, ...changes } : page)),
    });

  const remove = (id) => {
    if (pages.length <= 1) return;
    const page = pages.find((one) => one.id === id);
    const count = page?.widgets?.length || 0;
    const what = count === 0 ? "" : ` and the ${count} ${count === 1 ? "widget" : "widgets"} on it`;
    if (!window.confirm(`Delete "${page?.name || id}"${what}? Undo will bring it back.`)) return;
    onChange({ ...layout, pages: pages.filter((one) => one.id !== id) });
  };

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = pages.findIndex((page) => page.id === active.id);
    const to = pages.findIndex((page) => page.id === over.id);
    if (from < 0 || to < 0) return;
    onChange({ ...layout, pages: arrayMove(pages, from, to) });
  };

  const totalCycle = queued.reduce(
    (sum, page) => sum + (page.dwell_seconds || rotation.default_dwell_seconds || 60),
    0
  );

  return (
    <div className="tab-panel pages-tab">
      <section className="card">
        <div className="card-head">
          <h2>Pages</h2>
          <button className="primary" onClick={onAddPage}>
            Add a page
          </button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={pages.map((page) => page.id)} strategy={verticalListSortingStrategy}>
            <ol className="page-list">
              {pages.map((page, index) => (
                <Row
                  key={page.id}
                  page={page}
                  index={index}
                  count={pages.length}
                  currentPageId={currentPageId}
                  pageLocked={pageLocked}
                  manifest={manifest}
                  uploads={uploads}
                  panel={panel}
                  onSet={(changes) =>
                    changes.chip_row
                      ? onSetChipRow(page.id, changes.chip_row)
                      : setPage(page.id, changes)
                  }
                  onShow={() => onShowPage(page.id)}
                  onEdit={() => onEditPage(page.id)}
                  onRemove={() => remove(page.id)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>

        <p className="hint">
          Drag a page by its handle to reorder it. A page out of the rotation is kept but
          never comes up on its own — Show still puts it on the panel, as can a Home
          Assistant automation.
        </p>
      </section>

      <section className="card">
        <h2>Rotation</h2>

        <label className="switch">
          <input
            type="checkbox"
            checked={Boolean(rotation.enabled)}
            onChange={(event) => setRotation("enabled", event.target.checked)}
          />
          <span>Cycle through the pages in rotation</span>
        </label>

        {rotation.enabled && (
          <label className="field">
            <span>Default time on each page</span>
            <select
              value={String(rotation.default_dwell_seconds ?? 60)}
              onChange={(event) => setRotation("default_dwell_seconds", Number(event.target.value))}
            >
              {DWELLS.filter((entry) => entry.value > 0).map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* First, and before anything describing the cycle: with the panel
            held, none of what follows is happening, and settings that quietly
            describe something that is not running are how an evening gets
            spent looking for a fault that is not there. */}
        {rotation.enabled && pageLocked && (
          <p className="hint">
            <b>The panel is locked on the page it is showing</b>, so the rotation is
            paused. Hold the right button on the panel to release it — it is not
            something the editor can undo, and the panel forgets it on a reboot.
          </p>
        )}
        {rotation.enabled && queued.length < 2 && (
          <p className="hint">
            Rotation needs at least two pages in it; with one it simply stays put.
          </p>
        )}
        {rotation.enabled && queued.length > 1 && (
          <p className="hint">
            A full cycle takes {formatDuration(totalCycle)}. Every page change is a full
            refresh, since pages differ too much for a partial one to come out clean.
          </p>
        )}
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
