import { useCallback, useEffect, useState } from "react";

import DeviceTab from "./DeviceTab.jsx";
import ImagesTab from "./ImagesTab.jsx";
import Inspector, { EditHead } from "./Inspector.jsx";
import Panel from "./Panel.jsx";
import PageBar from "./PageBar.jsx";
import PageList, { PageTabs } from "./PageList.jsx";
import PagesTab from "./PagesTab.jsx";
import TopBar from "./TopBar.jsx";
import { useNarrow } from "./useNarrow.js";
import WidgetPicker from "./WidgetPicker.jsx";
import * as api from "./api.js";
import { useHistory } from "./history.js";
import { GridIcon, ImageIcon, LayersIcon, SlidersIcon } from "./Icons.jsx";
import {
  DEFAULT_CHIP_ROW,
  DEFAULT_SNAP,
  FALLBACK_GRID,
  LANDSCAPE,
  PORTRAIT,
  chipRowTop,
  defaultPosition,
  hasBothShapes,
  hasChipRow,
  isChipType,
  isReachable,
  marginX,
  newId,
  otherChips,
  pageGrid,
  placeChipX,
  placeWidget,
  regridY,
  reorder,
  arrangementFor,
  settleChips,
  shapeFromOrientation,
  shapeGrid,
  shapePanel,
  sizesOn,
  widgetSize,
  widgetType,
  widgetsKey,
} from "./layout.js";

// Only for labelling the shortcut hints. Getting it wrong shows the wrong
// modifier on two buttons; both keys are bound regardless of platform.
const APPLE = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent);
const MOD = APPLE ? "⌘" : "Ctrl+";

// Four places to be, in the rail on a desktop and the tab bar on a phone.
// Identity, device health and Push are in the top bar above all of them.
// Settings last, where a settings tab is expected to be.
const SECTIONS = [
  { id: "design", label: "Editor", Icon: GridIcon },
  { id: "pages", label: "Pages", Icon: LayersIcon },
  { id: "images", label: "Images", Icon: ImageIcon },
  { id: "device", label: "Settings", Icon: SlidersIcon },
];

// What the panel is showing versus what is in the editor, in words the reader
// can act on. The version numbers behind it stay internal; they are noise on
// screen. The distinctions are the point: waiting on a sleeping panel and
// having forgotten to press Push call for opposite responses, and neither is
// the same as the add-on genuinely not knowing.
function syncState(status) {
  if (!status) {
    return {
      tone: "unknown",
      label: "Unknown",
      detail: "Waiting for the add-on.",
      note: "Nothing has been heard from the add-on yet.",
    };
  }
  if (!status.draft_pushed) {
    return {
      tone: "pending",
      label: "Changes not pushed",
      detail: "Edits are saved here and nothing has been sent.",
      // The only state pressing Push actually resolves
      nudge: true,
    };
  }

  const applied = status.applied;
  if (!applied) {
    return {
      tone: "unknown",
      label: "Unknown",
      detail:
        "The panel has never been heard from, so there is no manifest: no widget types, no grid, no sizes.",
      note: "It publishes its manifest at boot. Check it is on the same MQTT broker.",
    };
  }
  if (applied.ok === false) {
    return {
      tone: "bad",
      label: "The device refused it",
      detail: `It could not build version ${applied.version ?? status.pushed_version ?? "?"}.`,
      // Shown as text rather than only as a tooltip: it is the one thing on
      // screen that says which widget is at fault.
      error: applied.error || "No reason was given.",
    };
  }
  // Sent, but the panel has not confirmed that version. Its own tone, because
  // this is the state that looks most like "not pushed" and calls for the
  // opposite response -- a device in its night sleep collects the push when it
  // next wakes, and pressing Push again changes nothing.
  if (applied.version !== status.pushed_version) {
    return {
      tone: "waiting",
      label: "Awaiting the device",
      detail: `Version ${status.pushed_version ?? "?"} is out on the broker. The panel will collect it when it next wakes.`,
      note: "Pushing again will not help",
    };
  }
  return {
    tone: "ok",
    label: "In sync",
    detail: "The panel is drawing exactly what is stored here. Nothing to do.",
  };
}

function useStatus(panelId) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Cleared rather than left showing the previous panel's health while the
    // first poll of the new one is in the air. They are different devices; a
    // stale "Online, 84%" against the wrong name is worse than a blank.
    setStatus(null);
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
  }, [panelId]);

  return { status, error };
}

// Messages used to be a full-width bar between the tabs and the canvas, so
// every "Sent to the device" pushed the whole editor down by 67px and let it
// spring back seconds later. A toast says the same thing without moving
// anything, which on a phone was the difference between six stacked bars and
// five.
function useToast() {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  // Re-shown rather than ignored when the same text arrives twice: pressing
  // Push twice should acknowledge twice, and an object identity is what makes
  // the second one restart the timer.
  //
  // useCallback, so the setter keeps one identity across renders. It was a bare
  // arrow -- a new function every render -- and the moment anything listed it
  // as an effect dependency, that effect re-ran on every render. The loader
  // below did, and the editor sat in an endless loop of fetches.
  const show = useCallback(
    (text) => setMessage(text ? { text, at: Date.now() } : null),
    []
  );

  return [message, show];
}

// Which panel was last being edited, so a reload comes back to it. Per browser
// rather than per install: two people can have two panels open at once, and the
// add-on has no business remembering one of them as "the" choice.
const PANEL_KEY = "inkplate.panel";

export default function App() {
  // Chosen before anything is fetched: api.setPanel decides which panel every
  // scoped request below is about, and a status poll that started first would
  // be about the wrong one.
  const [panels, setPanels] = useState([]);
  const [panelId, setPanelId] = useState(() => {
    try {
      return window.localStorage.getItem(PANEL_KEY) || null;
    } catch {
      // Safari in a private window throws on localStorage rather than
      // returning null, and losing the last choice is not worth a blank editor.
      return null;
    }
  });
  api.setPanel(panelId);

  const { status, error: statusError } = useStatus(panelId);
  const history = useHistory();
  const [layout, setLayout] = useState(null);
  const [entities, setEntities] = useState([]);
  const [devices, setDevices] = useState([]);
  const [areas, setAreas] = useState([]);
  const [uploads, setUploads] = useState([]);
  // The photo widget picks one of these by name. Kept beside the uploads
  // because they come from the same tab and are refreshed by the same events.
  const [albums, setAlbums] = useState([]);
  const [tab, setTab] = useState("design");
  const [activePageId, setActivePageId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [snapMode, setSnapMode] = useState(DEFAULT_SNAP);
  const [zoom, setZoom] = useState("fit");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useToast();
  const narrow = useNarrow();
  // Too narrow for a column of pages beside the canvas: they become a strip of
  // tabs above it instead.
  const compact = useNarrow("(max-width: 1400px)");

  const manifest = status?.manifest;

  // Which of the page's two arrangements is being edited. Starts as the shape
  // the panel is actually standing in, so opening the editor shows what the
  // panel shows; the toolbar switches it. A panel whose firmware only publishes
  // one shape stays on that one and never offers the switch.
  const [editShape, setEditShape] = useState(null);
  const panelShape = shapeFromOrientation(Number(manifest?.display?.orientation ?? 0));
  const shape = hasBothShapes(manifest) ? editShape || panelShape : panelShape;
  useEffect(() => {
    // Follows the panel when it turns, unless somebody has chosen a shape.
    if (!editShape) return;
    if (!hasBothShapes(manifest)) setEditShape(null);
  }, [manifest, editShape]);

  const panel = shapePanel(manifest, shape);
  // The firmware owns the grid and publishes it; this is only the fallback
  // Merged over the fallback rather than replacing it. The add-on updates
  // independently of the firmware, so between the two releases the manifest is
  // the old one and has no chip_h at all -- and an undefined there puts NaN
  // into the chip band's geometry rather than simply looking wrong.
  const deviceGrid = { ...FALLBACK_GRID, ...shapeGrid(manifest, shape) };

  const pages = layout?.pages || [];
  const activePage = pages.find((page) => page.id === activePageId) || pages[0] || null;

  // Pinned as soon as there is a layout, rather than left to fall back to
  // pages[0] on every render. Reordering in the Pages tab rewrites the array,
  // so an unpinned selection followed a page it had never been pointed at:
  // dragging a page to the top silently changed what the Design tab was
  // editing, and the widget you went back for was not there.
  useEffect(() => {
    if (!activePageId && activePage) setActivePageId(activePage.id);
  }, [activePageId, activePage]);
  // The arrangement for the shape being edited. A page that has never been laid
  // out in this shape has none, and the panel draws the other one bent onto this
  // grid -- so that is what is shown, and the first edit makes it real. See
  // updateWidgets.
  const arrangementKey = widgetsKey(shape);
  const ownArrangement = activePage?.[arrangementKey];
  const inherited = !ownArrangement && shape === PORTRAIT;
  const widgets = arrangementFor(activePage, shape, manifest);
  // Where the chip row sits, or whether the page has one at all, is a layout
  // choice and a *per page* one -- the firmware draws at the pixels it is given
  // and never derives a row. With no row the page's cells are taller, which is
  // what pageGrid folds in, so everything downstream can go on taking one grid.
  const chipRow = activePage?.chip_row || DEFAULT_CHIP_ROW;
  const grid = pageGrid(deviceGrid, chipRow);
  const selected = widgets.find((widget) => widget.id === selectedId) || null;

  // Editing a widget on a phone is a screen of its own: the canvas pinned at
  // the top, the options under it, and nothing else -- no bars, no tab bar.
  // That is all the height a phone has, given to the thing being edited.
  const editing = narrow && tab === "design" && Boolean(selected);

  // Both timestamps come from the backend, so a clock skewed on this machine
  // cannot make "last seen" nonsense.
  const lastSeenAge =
    status?.last_seen && status?.server_time
      ? Math.max(0, status.server_time - status.last_seen)
      : null;

  const sync = syncState(status);

  // The panel list, and the first choice.
  //
  // Polled slowly as well as read at startup: a panel switched on while the
  // editor is open should turn up in the dropdown without a reload, and that is
  // the whole of how a panel is ever added.
  const loadPanels = useCallback(async () => {
    try {
      const data = await api.getPanels();
      const found = data.panels || [];
      setPanels(found);
      // Nothing chosen, or a choice that is no longer a panel -- which happens
      // when one is forgotten, or when a browser remembers an id from another
      // install. Falling back to the default rather than to nothing keeps the
      // editor showing a dashboard.
      const known = found.some((panel) => panel.id === panelId);
      if (!known) {
        const next = data.default || found[0]?.id || null;
        if (next !== panelId) {
          api.setPanel(next);
          setPanelId(next);
        }
      }
    } catch {
      setPanels([]);
    }
  }, [panelId]);

  useEffect(() => {
    loadPanels();
    const timer = setInterval(loadPanels, 15000);
    return () => clearInterval(timer);
  }, [loadPanels]);

  const selectPanel = useCallback((id) => {
    try {
      window.localStorage.setItem(PANEL_KEY, id);
    } catch {
      // See the read in useState: a private window throws here, and the choice
      // simply does not survive a reload.
    }
    api.setPanel(id);
    setPanelId(id);
    // The layout belongs to the panel, so the one on screen is now the wrong
    // one. Cleared rather than left up while the new one loads: a page of the
    // old panel's widgets, editable, against the new panel's grid, is an edit
    // saved to the wrong dashboard.
    setLayout(null);
    setActivePageId(null);
    setSelectedId(null);
    history.reset();
  }, [history]);

  const forgetPanel = useCallback(
    async (id) => {
      try {
        await api.forgetPanel(id);
        await loadPanels();
      } catch (problem) {
        setMessage(problem.message);
      }
    },
    [loadPanels, setMessage]
  );

  const renamePanel = useCallback(
    async (id, name) => {
      try {
        await api.renamePanel(id, name);
        await loadPanels();
      } catch (problem) {
        setMessage(problem.message);
      }
    },
    [loadPanels, setMessage]
  );

  useEffect(() => {
    if (!panelId) return;
    api.getLayout().then(setLayout).catch((problem) => setMessage(problem.message));
    api.getEntities().then(setEntities).catch(() => setEntities([]));
    // For the device widget's picker. Its own call rather than derived from the
    // entities: the device registry is a separate websocket read, and a device
    // is not something the state list knows about.
    api.getDevices().then(setDevices).catch(() => setDevices([]));
    // Same reasoning, for the room widget's area picker.
    api.getAreas().then(setAreas).catch(() => setAreas([]));
    // Named in the image widget's picker alongside the built-in icons
    api.getImages().then((data) => setUploads(data.images || [])).catch(() => setUploads([]));
    // The panel, and nothing else: this is "load everything about the panel
    // being edited", and it runs when that changes.
  }, [panelId, setMessage]);

  // The photo widget's album picker, which the firmware cannot supply: albums
  // are the add-on's own.
  //
  // Re-read on the way back to the design tab rather than once at startup. The
  // picker shows how many of an album's pictures are rendered, and rendering
  // happens in the background over minutes -- so a count fetched at mount is
  // stale by the time anyone opens the widget, and reads as nothing having
  // happened.
  useEffect(() => {
    if (tab !== "design") return;
    api.getAlbums().then((data) => setAlbums(data.albums || [])).catch(() => setAlbums([]));
  }, [tab]);

  // Every layout change funnels through here, which is what makes undo a single
  // line rather than an inverse per kind of edit: the layout as it stands is
  // put on the history stack before the new one replaces it.
  //
  // record:false is for changes that are not the user's edit -- the two
  // restores below, which are the history moving rather than a new step, and
  // the rescue of stranded widgets. Recording the rescue would offer to undo
  // back to a layout the editor cannot reach a widget in, and the effect would
  // simply rescue it again.
  const persist = useCallback(
    async (next, { record = true } = {}) => {
      if (record) history.record(layout);
      setLayout(next);
      try {
        await api.saveLayout(next);
      } catch (problem) {
        setMessage(problem.message);
      }
    },
    [history, layout]
  );

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
      // Writes to the arrangement for the shape being edited, and materialises
      // it on the first edit if the page was inheriting the other shape's --
      // what was on screen is what gets written, so the edit lands on top of
      // the arrangement the user could see rather than on an empty page.
      page[arrangementKey] = updater(page[arrangementKey] || widgets);
      persist(next);
    },
    [layout, persist, activePage, arrangementKey, widgets]
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
    // Each page is measured against its own chip row: the same widget is 34px
    // taller per row on a page that has none.
    const pageChipRow = (page) => page.chip_row || DEFAULT_CHIP_ROW;

    // Each arrangement against the shape it was laid out for, which is the whole
    // of the care needed here. Measuring them all against the shape being edited
    // is destructive rather than merely wrong: switch the toolbar to sideways on
    // a V2 and every upright card past x=720 is off a 720-wide panel, so this
    // would sweep an entire landscape page into the top left corner -- and it
    // saves without asking, so the layout would be gone before anyone saw it.
    //
    // A shape is only checked when the manifest describes it, since its box is
    // the thing being measured against; the shape on screen is always checked,
    // which is what firmware too old to publish both leaves.
    const checkable = [LANDSCAPE, PORTRAIT].filter(
      (which) => Boolean(manifest?.shapes?.[which]) || which === shape
    );
    const shapeBox = (which) => shapePanel(manifest, which);
    const shapeDeviceGrid = (which) => ({ ...FALLBACK_GRID, ...shapeGrid(manifest, which) });

    const stranded = (page) =>
      checkable.reduce((total, which) => {
        const arrangement = page[widgetsKey(which)];
        if (!arrangement) return total;
        return (
          total
          + arrangement.filter(
              (widget) =>
                !isReachable(
                  widget,
                  widgetSize(
                    manifest, widget, uploads, pageChipRow(page),
                    pageGrid(shapeDeviceGrid(which), pageChipRow(page))
                  ),
                  shapeBox(which)
                )
            ).length
        );
      }, 0);

    const rescued = (layout.pages || []).reduce((total, page) => total + stranded(page), 0);

    // What settleChips needs to know of a widget: whether it is a chip, and the
    // width the manifest reserves for it on this shape.
    const chipSizeOf = (page, which) => (widget) => {
      if (!isChipType(widgetType(manifest, widget))) return { isChip: false };
      const rowSetting = pageChipRow(page);
      const size = widgetSize(
        manifest, widget, uploads, rowSetting, pageGrid(shapeDeviceGrid(which), rowSetting)
      );
      return { isChip: true, width: size.width };
    };

    // Chips off their row, or on top of one another. Counted on the layout as it
    // is, without copying it, for the same reason as the stranded count: this
    // runs on every poll, and settleChips changes nothing in a row that is
    // already settled, so after the first time a layout costs nothing here.
    const unsettled = (layout.pages || []).reduce(
      (total, page) =>
        total
        + checkable.filter((which) => {
          const arrangement = page[widgetsKey(which)];
          if (!arrangement) return false;
          const rowSetting = pageChipRow(page);
          return settleChips(
            arrangement, chipSizeOf(page, which),
            pageGrid(shapeDeviceGrid(which), rowSetting), shapeBox(which), rowSetting
          ).changed;
        }).length,
      0
    );

    if (rescued === 0 && unsettled === 0) return;

    const next = structuredClone(layout);
    for (const page of next.pages || []) {
      const rowSetting = pageChipRow(page);
      for (const which of checkable) {
        const key = widgetsKey(which);
        const arrangement = page[key];
        if (!arrangement) continue;
        const box = shapeBox(which);
        const pageShapeGrid = pageGrid(shapeDeviceGrid(which), rowSetting);
        for (const widget of arrangement) {
          const size = widgetSize(manifest, widget, uploads, rowSetting, pageShapeGrid);
          if (isReachable(widget, size, box)) continue;
          const home = defaultPosition(pageShapeGrid, {
            chipRow: rowSetting,
            isChip: isChipType(widgetType(manifest, widget)),
            panel: box,
          });
          widget.x = home.x;
          widget.y = home.y;
        }
        // After the rescue, not instead of it: every stranded chip has just
        // been sent to the same spot at the start of the row, and this is what
        // spreads them along it rather than leaving them stacked there.
        page[key] = settleChips(
          page[key], chipSizeOf(page, which), pageShapeGrid, box, rowSetting
        ).widgets;
      }
    }

    if (rescued > 0) {
      setMessage(
        rescued === 1
          ? "A widget was off the panel and has been moved back to the top left."
          : `${rescued} widgets were off the panel and have been moved back to the top left.`
      );
    } else {
      setMessage("The chips have been put back into the chip row.");
    }
    persist(next, { record: false });
  }, [layout, manifest, uploads, shape, panel.width, panel.height, grid.gap, persist]);

  // Undo and redo restore a whole layout, so the selection can be pointing at a
  // widget that no longer exists -- undoing an add, or a chip row turned off.
  // Left alone, the inspector would edit a widget that is not in the layout and
  // every change would be dropped by updateWidgets' map.
  const restore = (next, label) => {
    if (!next) return;
    persist(next, { record: false });
    const page = next.pages?.find((one) => one.id === activePage?.id) || next.pages?.[0];
    // Either arrangement: undoing while editing sideways restores a layout whose
    // portrait widgets are the ones the selection can still be pointing at.
    const present = [LANDSCAPE, PORTRAIT]
      .flatMap((which) => page?.[widgetsKey(which)] || [])
      .some((widget) => widget.id === selectedId);
    if (!present) setSelectedId(null);
    setMessage(label);
  };

  const undo = () => restore(history.undo(layout), "Undone");
  const redo = () => restore(history.redo(layout), "Redone");

  const addWidget = (type) => {
    // Lands on the first cell rather than the very corner, so a new widget is
    // already grid-aligned and inside the edge gap. A chip lands in the chip
    // row, which is the only row it can occupy.
    const isChip = isChipType(type);
    // The picker disables these, so this is the belt to that pair of braces: a
    // chip on a page with no row would have nowhere legal to sit.
    if (isChip && !hasChipRow(chipRow)) return;
    const widget = {
      id: newId(),
      type: type.type,
      ...defaultPosition(grid, { chipRow, isChip, panel }),
      options: {},
      // The first size this shape has room for: the firmware publishes the
      // sizes of both shapes, and its first is not always one of this one's.
      ...(type.sizes?.length ? { size: (sizesOn(type, grid)[0] || type.sizes[0]).id } : {}),
    };

    // A new chip starts at the left of the row and slides clear of whatever is
    // already there, rather than landing on top of it.
    if (isChip) {
      // From the margin, which is where a chip pushed against the edge stops --
      // starting it at the gap put a new chip a few pixels off the place the
      // same chip would land if you dragged it there, on every shape where the
      // two numbers differ, which is all of them now.
      widget.x = placeChipX(
        marginX(grid),
        widgetSize(manifest, widget, uploads, chipRow, grid).width,
        otherChips(widgets, manifest, uploads, widget.id, grid),
        grid,
        panel
      );
    }

    updateWidgets((current) => [...current, widget]);
    setSelectedId(widget.id);
  };

  // Changing a page's chip row moves everything on that page. Moving the row
  // from one edge to the other shifts the card band; turning it off also makes
  // every row 34px taller, so the pitch changes and a widget has to be put back
  // on the row it was on rather than nudged by a constant. regridY does that.
  //
  // Takes the page id rather than assuming the one being edited. Only the
  // canvas dock calls it now, which always means the active page -- but the
  // confirm below names the page it is about, and a function that has to be
  // told which page that is cannot name the wrong one.
  const setChipRow = (pageId, next) => {
    const page = pages.find((one) => one.id === pageId);
    if (!page) return;
    const from = page.chip_row || DEFAULT_CHIP_ROW;
    if (next === from) return;

    // Chips are deleted rather than hidden, because a widget that cannot be
    // seen or selected is one the editor offers no way back to. Undo covers it
    // now, which is what the confirm says; it is still worth asking, since the
    // chips go without being the thing that was clicked.
    // Both arrangements, because the chip row is a property of the *page* and
    // one setting governs whichever way the panel is standing. Counting only
    // the upright one left the sideways arrangement holding chips for a row that
    // no longer existed, which the panel then drew over the cards.
    const doomed = hasChipRow(next)
      ? []
      : [LANDSCAPE, PORTRAIT]
          .flatMap((which) => page[widgetsKey(which)] || [])
          .filter((widget) => isChipType(widgetType(manifest, widget)));
    if (doomed.length > 0) {
      const what =
        doomed.length === 1
          ? `the chip on "${page.name || page.id}"`
          : `all ${doomed.length} chips on "${page.name || page.id}"`;
      if (!window.confirm(`Turning the chip row off deletes ${what}. Undo will bring them back.`)) {
        return;
      }
    }

    const moved = structuredClone(layout);
    const target = moved.pages.find((candidate) => candidate.id === pageId);
    if (!target) return;

    target.chip_row = next;

    // Each arrangement against its own grid: the row sits at a different height
    // on a panel on its side, and the cells are at a different pitch, so reusing
    // the edited shape's numbers for the other one put every card a row out.
    const gone = new Set(doomed.map((widget) => widget.id));
    for (const which of [LANDSCAPE, PORTRAIT]) {
      const key = widgetsKey(which);
      if (!target[key]) continue;
      const shapeDeviceGrid = { ...FALLBACK_GRID, ...shapeGrid(manifest, which) };
      const chipY = chipRowTop(pageGrid(shapeDeviceGrid, next), shapePanel(manifest, which), next);
      target[key] = target[key]
        .filter((widget) => !gone.has(widget.id))
        .map((widget) =>
          isChipType(widgetType(manifest, widget))
            ? { ...widget, y: chipY }
            : { ...widget, y: regridY(widget.y, shapeDeviceGrid, from, next) }
        );
    }

    if (doomed.some((one) => one.id === selectedId)) setSelectedId(null);
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

  // A copy beside the original, not on top of it: two widgets at the same
  // pixels look like one, and the top one is the only one a click can reach.
  //
  // The step is the widget's own footprint plus a gap, which in grid mode lands
  // exactly on the next free cell -- a span of n cells is n*unit_w + (n-1)*gap
  // wide, so adding a gap gives n whole pitches. One offset serves both modes.
  const duplicateWidget = (id) => {
    const source = widgets.find((widget) => widget.id === id);
    if (!source) return;

    const copy = { ...structuredClone(source), id: newId() };
    const size = widgetSize(manifest, copy, uploads, chipRow, grid);
    const isChip = isChipType(widgetType(manifest, copy));
    const others = otherChips(widgets, manifest, uploads, copy.id, grid);

    // Right, then down, then back the other way. Each is clamped to the panel,
    // so at the far edge the offset is undone and the spot comes back equal to
    // the original's -- which is what makes trying the next direction the test.
    const spots = [
      { x: size.width + grid.gap, y: 0 },
      { x: 0, y: size.height + grid.gap },
      { x: -(size.width + grid.gap), y: 0 },
      { x: 0, y: -(size.height + grid.gap) },
      // Nowhere free: on top of the original, which is at least selectable,
      // since the copy is appended and so draws last.
      { x: 0, y: 0 },
    ].map((delta) =>
      placeWidget(copy, delta, snapMode, grid, size, panel, { chipRow, isChip, others })
    );

    const placed =
      spots.find((spot) => spot.x !== source.x || spot.y !== source.y) || spots[spots.length - 1];

    updateWidgets((current) => [...current, { ...copy, ...placed }]);
    setSelectedId(copy.id);
  };

  // Draw order is array order, on the panel as on the canvas -- see reorder().
  const setLayer = (id, move) => updateWidgets((current) => reorder(current, id, move));

  const setOption = (id, key, value) =>
    updateWidgets((current) =>
      current.map((widget) =>
        widget.id === id ? { ...widget, options: { ...widget.options, [key]: value } } : widget
      )
    );

  // Several options in one edit, so they land in a single layout save. Picking
  // a device sets its id, its resolved entity list and its name together, and
  // three separate saves would leave two intermediate layouts on disk -- one of
  // them with a device chosen and no entities, which is a card that draws
  // nothing.
  const setOptions = (id, patch) =>
    updateWidgets((current) =>
      current.map((widget) =>
        widget.id === id ? { ...widget, options: { ...widget.options, ...patch } } : widget
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
          ...placeWidget(resized, { x: 0, y: 0 }, snapMode, grid, widgetSize(manifest, resized, uploads, chipRow, grid), panel, {
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
      // Inherited from the page being looked at rather than reset to the
      // default: a dashboard whose pages all carry the row at the top wants the
      // next one the same way, and it is one click to change.
      chip_row: chipRow,
      widgets: [],
    };
    persist({ ...layout, pages: [...pages, page] });
    setActivePageId(id);
    setSelectedId(null);
    return id;
  };

  // Bound on the window rather than on the canvas: the canvas is not focusable,
  // and undo covers page and device settings too, not only what is on it.
  // Re-bound on every render, which is what keeps the handlers current without
  // a ref -- adding and removing one listener costs nothing beside a re-render.
  useEffect(() => {
    const onKey = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      // Cmd+Z belongs to whatever is being typed in first; taking it here would
      // undo a layout edit instead of the half-written name in the field.
      if (event.target?.closest?.("input, textarea, select, [contenteditable]")) return;

      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        (event.shiftKey ? redo : undo)();
      } else if (key === "y") {
        // Windows' redo. Shift+Cmd+Z is the one advertised.
        event.preventDefault();
        redo();
      } else if (key === "d" && selectedId) {
        event.preventDefault();
        duplicateWidget(selectedId);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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

  const selectPage = (id) => {
    setActivePageId(id);
    setSelectedId(null);
  };

  const view = {
    snapMode,
    onSnap: setSnapMode,
    zoom,
    onZoom: setZoom,
    chipRow,
    onChipRow: (next) => activePage && setChipRow(activePage.id, next),
  };

  const layer = widgets.findIndex((one) => one.id === selected?.id);
  const selectionActions = selected && {
    layer,
    layerCount: widgets.length,
    onFront: () => setLayer(selectedId, "front"),
    onBack: () => setLayer(selectedId, "back"),
    onDuplicate: () => duplicateWidget(selectedId),
    onDelete: () => removeWidget(selectedId),
    mod: MOD,
  };

  const pageBar = (
    <PageBar
      narrow={narrow}
      shape={shape}
      onShape={setEditShape}
      shapeSwitchable={hasBothShapes(manifest)}
      shapeInherited={inherited}
      onAddWidget={() => setAdding(true)}
      canAddWidget={Boolean(manifest)}
      undo={undo}
      redo={redo}
      canUndo={history.canUndo}
      canRedo={history.canRedo}
      mod={MOD}
      {...view}
    />
  );

  return (
    <div className={editing ? "app editing" : "app"}>
      <nav className="rail" aria-label="Sections">
        {SECTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={tab === id ? "rail-item active" : "rail-item"}
            onClick={() => setTab(id)}
            title={label}
            aria-label={label}
            aria-current={tab === id ? "page" : undefined}
          >
            <Icon size={19} width={tab === id ? 2 : 1.9} />
          </button>
        ))}
      </nav>

      {!editing && (
        <nav className="tabbar" aria-label="Sections">
          {SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={tab === id ? "tabbar-item active" : "tabbar-item"}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
            >
              <span className="tabbar-glyph">
                <Icon size={27} width={tab === id ? 2 : 1.8} />
              </span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="main">
        {!editing && (
          <TopBar
            status={status}
            panels={panels}
            panelId={panelId}
            onSelectPanel={selectPanel}
            lastSeenAge={lastSeenAge}
            sync={sync}
            onPush={push}
          />
        )}

        {!manifest && (
          <div className="banner">
            Waiting for the panel to describe itself. It does that when it starts, so switch
            it on and check it uses the same MQTT broker.
          </div>
        )}

      {tab === "design" && (
        <div className={editing ? "workspace editing" : "workspace"}>
          {!compact && (
            <PageList
              pages={pages}
              activeId={activePage?.id}
              currentPageId={status?.current_page}
              pageLocked={Boolean(status?.page_locked)}
              rotation={layout.rotation}
              onSelect={selectPage}
              onAdd={() => setTab("pages")}
            />
          )}

          <main>
            {editing && (
              <EditHead
                widget={selected}
                manifest={manifest}
                layer={layer}
                layerCount={widgets.length}
                onDone={() => setSelectedId(null)}
                onFront={selectionActions.onFront}
                onBack={selectionActions.onBack}
                onDuplicate={selectionActions.onDuplicate}
                onRemove={selectionActions.onDelete}
              />
            )}

            {compact && !editing && (
              <PageTabs
                pages={pages}
                activeId={activePage?.id}
                currentPageId={status?.current_page}
                onSelect={selectPage}
              />
            )}

            {!narrow && pageBar}

            <Panel
              panel={panel}
              widgets={widgets}
              manifest={manifest}
              uploads={uploads}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMove={moveWidget}
              onResize={setSize}
              snapMode={snapMode}
              grid={grid}
              chipRow={chipRow}
              zoom={zoom}
              shape={shape}
              actions={narrow ? null : selectionActions}
            />

            {narrow && !editing && pageBar}
          </main>

          <Inspector
            widget={selected}
            manifest={manifest}
            grid={grid}
            entities={entities}
            devices={devices}
            areas={areas}
            uploads={uploads}
            albums={albums}
            onSetOption={setOption}
            onSetOptions={setOptions}
            onSetSize={setSize}
            onClose={() => setSelectedId(null)}
          />

          {adding && (
            <WidgetPicker
              manifest={manifest}
              chipRow={chipRow}
              grid={grid}
              onAdd={addWidget}
              onClose={() => setAdding(false)}
            />
          )}
        </div>
      )}

      {tab === "pages" && (
        <PagesTab
          layout={layout}
          onChipRow={setChipRow}
          currentPageId={status?.current_page}
          pageLocked={Boolean(status?.page_locked)}
          manifest={manifest}
          uploads={uploads}
          panel={panel}
          shape={shape}
          onChange={persist}
          onAddPage={addPage}
          onEditPage={(id) => {
            setActivePageId(id);
            setSelectedId(null);
            setTab("design");
          }}
          onShowPage={(id) => {
            // The page's *name*, not its id. The id is a hash the editor makes
            // up and never shows anywhere else, so "Showing page_a3f9c1" named
            // something the reader had no way to recognise.
            const page = pages.find((one) => one.id === id);
            api
              .showPage(id)
              .then(() => setMessage(`Showing “${page?.name || id}” on the device`))
              .catch((problem) => setMessage(problem.message));
          }}
          onSetPageLock={(locked) => {
            api
              .setPageLock(locked)
              .then(() => setMessage(locked ? "Holding the panel here" : "Letting the panel rotate again"))
              .catch((problem) => setMessage(problem.message));
          }}
        />
      )}

      {/* ImagesTab takes the device's grid, not a page's: its size presets are
          for a picture, and the tab is not scoped to a page. */}
      {tab === "images" && (
        <ImagesTab
          grid={deviceGrid}
          panel={panel}
          onMessage={(text) => {
            setMessage(text);
            api.getImages().then((data) => setUploads(data.images || [])).catch(() => {});
            // An album added or removed here changes what the photo widget's
            // picker can offer, and the Design tab is not remounted on the way
            // back to it.
            api.getAlbums().then((data) => setAlbums(data.albums || [])).catch(() => {});
          }}
        />
      )}

      {tab === "device" && (
        <DeviceTab
          status={status}
          pages={pages}
          panels={panels}
          panelId={panelId}
          onRenamePanel={renamePanel}
          onForgetPanel={forgetPanel}
          lastSeenAge={lastSeenAge}
          sleep={layout.sleep}
          onSleepChange={(next) => persist({ ...layout, sleep: next })}
          battery={layout.battery}
          onBatteryChange={(next) => persist({ ...layout, battery: next })}
          refresh={layout.refresh}
          onRefreshChange={(next) => persist({ ...layout, refresh: next })}
          orientation={layout.orientation}
          onOrientationChange={(next) => persist({ ...layout, orientation: next })}
          timerTickMs={layout.timer_tick_ms ?? (layout.timer_tick_seconds
            ? layout.timer_tick_seconds * 1000
            : undefined)}
          pomodoroAutoStart={layout.pomodoro_auto_start}
          onPomodoroAutoStartChange={(next) =>
            persist({ ...layout, pomodoro_auto_start: next })
          }
          onTimerTickChange={(next) =>
            persist({ ...layout, timer_tick_ms: next, timer_tick_seconds: undefined })
          }
          onRefresh={() => api.refreshDevice().then(() => setMessage("Refresh sent"))}
          onShowInfo={() =>
            api.showDeviceInfo().then(() => setMessage("Showing diagnostics on the panel"))
          }
          onPush={push}
        />
      )}

      </div>

      {/* Outside .main so the fixed toast is positioned by the viewport rather
          than by a flex column that may have scrolled. */}
      {message && (
        <div className="toast" role="status" onClick={() => setMessage(null)}>
          {message.text}
        </div>
      )}
    </div>
  );
}
