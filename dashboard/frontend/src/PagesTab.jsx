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
import { EyeIcon, GripIcon, LockIcon, PencilIcon, TrashIcon } from "./Icons.jsx";
import { CHIP_ROW_POSITIONS, DEFAULT_CHIP_ROW, arrangementFor } from "./layout.js";
import { effectiveDwell, formatClock, formatDuration } from "./format.js";
import { Hint } from "./Popover.jsx";

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
//
// Design 1c puts the rotation switch and the default dwell in the header rather
// than in a card below the list, because both of them describe the list you are
// looking at; and it moves the per-page settings off the row's face -- queued
// is a two-way segment, the actions are icons, and the chip row is not here at
// all. That last one went back to the canvas dock, where you can see what
// turning it off does to the page.

// Short, because both places these appear are sentences -- "dwell 30 s" in a
// row's meta line, "Default dwell 30 s" in the header pill -- and a menu that
// says "30 seconds" inside one reads as a stray fragment of another.
const DWELLS = [
  { value: 0, label: "default" },
  { value: 15, label: "15 s" },
  { value: 30, label: "30 s" },
  { value: 60, label: "1 min" },
  { value: 300, label: "5 min" },
  { value: 900, label: "15 min" },
];

function Row({
  page,
  index,
  count,
  currentPageId,
  pageLocked,
  manifest,
  uploads,
  panel,
  shape,
  onSet,
  onShow,
  onToggleLock,
  onRemove,
  onEdit,
  onChipRow,
  defaultDwell,
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: page.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const live = page.id === currentPageId;
  const name = page.name || page.id;
  const widgets = arrangementFor(page, shape, manifest).length;

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
        aria-label={`Reorder ${name}, currently ${index + 1} of ${count}`}
      >
        <GripIcon />
      </button>

      <PageThumb page={page} manifest={manifest} uploads={uploads} panel={panel} shape={shape} />

      <div className="page-row-main">
        <div className="page-row-title">
          {/* Sized to its content, so the badge sits against the name rather
              than at the far end of a field padded out to twenty characters.
              field-sizing: content would do this in CSS, but WebKit does not
              have it yet and this screen is checked in WebKit. */}
          <input
            className="page-row-name"
            size={Math.max(4, (page.name || page.id || "").length)}
            value={page.name || ""}
            onChange={(event) => onSet({ name: event.target.value })}
            placeholder={page.id}
            aria-label="Page name"
          />
          {live && (
            <span className={pageLocked ? "badge yellow" : "badge blue"}>
              {pageLocked ? <LockIcon size={11} /> : <EyeIcon size={11} />}
              {pageLocked ? "Held here" : "Showing now"}
            </span>
          )}
        </div>

        <div className="page-row-meta">
          {widgets} {widgets === 1 ? "widget" : "widgets"} ·{" "}
          {/* Each setting reads as part of the sentence and opens as a menu: a
              page's chip row and time on screen are facts about it before they
              are settings. The chip row goes through App, because moving it
              moves every widget on the page. */}
          <label className="meta-dwell">
            <span className="sr-only">Chip row</span>
            <select
              value={page.chip_row || DEFAULT_CHIP_ROW}
              onChange={(event) => onChipRow(event.target.value)}
            >
              {CHIP_ROW_POSITIONS.map(({ id, label }) => (
                <option key={id} value={id}>
                  chips {label.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          {page.queued ? (
            <>
              {" · "}
              <label className="meta-dwell">
                <span className="sr-only">Time on this page</span>
                <select
                  value={String(page.dwell_seconds || 0)}
                  onChange={(event) => onSet({ dwell_seconds: Number(event.target.value) })}
                >
                  {DWELLS.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.value === 0 ? `${formatDuration(defaultDwell)} (usual)` : entry.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            " · paused, shown only on request"
          )}
        </div>
      </div>

      <div className="page-row-actions">
        {/* Two states, both named. The switch this replaces said "In rotation"
            beside a toggle, which names only the state it is not in -- so what
            an off toggle meant (deleted? hidden? still there?) was left to be
            guessed, and the answer is the third row's meta line. */}
        {/* No .chip on these. Every other .seg in the app puts a bare button
            inside it, and for a reason: .chip.active:hover ties .seg
            button.active on specificity and wins on order, so a chip in a seg
            turns gradient the moment the pointer is over it. */}
        <div className="seg" role="group" aria-label="Rotation">
          <button
            className={page.queued ? "active" : undefined}
            onClick={() => onSet({ queued: true })}
            aria-pressed={Boolean(page.queued)}
          >
            Queued
          </button>
          <button
            className={page.queued ? undefined : "active"}
            onClick={() => onSet({ queued: false })}
            aria-pressed={!page.queued}
          >
            Paused
          </button>
        </div>

        <button className="icon-button" onClick={onEdit} title="Edit this page's layout" aria-label={`Edit ${name}`}>
          <PencilIcon size={15} />
        </button>
        <button
          className="icon-button dim"
          onClick={onShow}
          title="Show this page on the device now"
          aria-label={`Show ${name} on the device`}
        >
          <EyeIcon size={15} />
        </button>
        {live && (
          // Only on the live row: the device can only pin whichever page is
          // already on the panel, the same as a hold on its own right button.
          <button
            className={`icon-button${pageLocked ? " warn" : " dim"}`}
            onClick={onToggleLock}
            title={pageLocked ? "Let the panel rotate again" : "Hold the panel on this page"}
            aria-label={pageLocked ? `Release ${name}` : `Hold the panel on ${name}`}
          >
            <LockIcon size={15} />
          </button>
        )}
        <button
          className="icon-button danger"
          onClick={onRemove}
          disabled={count <= 1}
          aria-label={`Delete ${name}`}
          title={count <= 1 ? "A dashboard needs at least one page" : "Delete this page"}
        >
          <TrashIcon size={15} />
        </button>
      </div>
    </li>
  );
}

// How the loop divides between the pages in it. Each page's share is its dwell,
// so the bar is the cycle drawn to scale rather than a progress indicator.
function CycleCard({ rotation, queued, totalCycle }) {
  if (!rotation.enabled) {
    return (
      <section className="card">
        <span className="eyebrow">Cycle</span>
        <p className="hint" style={{ marginTop: 10 }}>
          Rotation is off: the panel stays on the page it was last sent.
        </p>
      </section>
    );
  }

  if (queued.length < 2) {
    return (
      <section className="card">
        <span className="eyebrow">Cycle</span>
        <p className="hint" style={{ marginTop: 10 }}>
          {queued.length === 1
            ? `Only “${queued[0].name || queued[0].id}” is queued, so it stays put.`
            : "No page is queued."}
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <span className="eyebrow">Cycle</span>
      <div className="cycle-total">
        <b>{formatClock(totalCycle)}</b>
        <span>per loop</span>
      </div>
      <div className="cycle-bar">
        {queued.map((page) => (
          <div key={page.id} style={{ flex: effectiveDwell(page, rotation) }} />
        ))}
      </div>
      <div className="cycle-key">
        {queued.map((page) => (
          <span key={page.id}>
            <b>{page.name || page.id}</b> {formatDuration(effectiveDwell(page, rotation))}
          </span>
        ))}
      </div>
    </section>
  );
}

export default function PagesTab({
  layout,
  onChipRow,
  currentPageId,
  pageLocked,
  manifest,
  uploads,
  panel,
  shape,
  onChange,
  onShowPage,
  onSetPageLock,
  onEditPage,
  onAddPage,
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

  const totalCycle = queued.reduce((sum, page) => sum + effectiveDwell(page, rotation), 0);
  const lockedPage = pages.find((page) => page.id === currentPageId);

  return (
    <div className="pages-wrap">
        {/* Above both columns, so the list and the cycle card start level */}
        <header className="screen-head">
          <h2 className="screen-title">
            Pages
            <Hint label="About pages">
              The order here is the order they rotate in; drag a page by its handle to move
              it. A paused page is kept but never comes up on its own &mdash; the eye still
              puts it on the panel, and so can a Home Assistant automation.
            </Hint>
          </h2>

          <label className="pill-field pill-toggle">
            <span>Rotate</span>
            <input
              type="checkbox"
              checked={Boolean(rotation.enabled)}
              onChange={(event) => setRotation("enabled", event.target.checked)}
            />
          </label>

          <label className="pill-field">
            <span>Each page</span>
            <select
              value={String(rotation.default_dwell_seconds ?? 60)}
              onChange={(event) => setRotation("default_dwell_seconds", Number(event.target.value))}
              disabled={!rotation.enabled}
            >
              {DWELLS.filter((entry) => entry.value > 0).map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        </header>

      <div className="pages-screen">
      <div className="pages-main">
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
                  shape={shape}
                  onSet={(changes) => setPage(page.id, changes)}
                  onShow={() => onShowPage(page.id)}
                  onToggleLock={() => onSetPageLock(!pageLocked)}
                  onEdit={() => onEditPage(page.id)}
                  onRemove={() => remove(page.id)}
                  onChipRow={(next) => onChipRow(page.id, next)}
                  defaultDwell={rotation.default_dwell_seconds ?? 60}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>

        {/* The label is one item and the aside another, so on a phone the aside
            wraps under it rather than the label breaking across two lines. */}
        <button className="add-button" onClick={onAddPage}>
          <b>+&nbsp; Add page</b>
        </button>
      </div>

      <aside className="side-column">
        {/* First, and before anything describing the cycle: with the panel held,
            none of what the cycle card says is happening, and a card that
            quietly describes something that is not running is how an evening
            gets spent looking for a fault that is not there. */}
        {pageLocked && (
          <div className="note warn">
            <div className="note-head">
              <LockIcon size={16} />
              Page held
            </div>
            <p>
              The panel is held on <b>{lockedPage?.name || lockedPage?.id || "one page"}</b>, so
              rotation is paused. Release it with the padlock above or the panel's button.
            </p>
          </div>
        )}

        <CycleCard rotation={rotation} queued={queued} totalCycle={totalCycle} />

      </aside>
      </div>
    </div>
  );
}
