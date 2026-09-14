import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import * as api from "./api.js";
import ImageEditor from "./ImageEditor.jsx";
import GridSizePicker from "./GridSizePicker.jsx";
import { CheckIcon, ImageIcon, RefreshIcon, TrashIcon, WarningIcon } from "./Icons.jsx";
import { DITHERS } from "./dither.js";

// Uploading a picture to the panel.
//
// The form used to ask everything at once, in whatever order the options were
// written: kind, then five "N wide" chips, then three "N tall" chips, then the
// editor, then brightness, contrast, dither and corners, then Upload. Nothing
// said which of those questions mattered before you had chosen a file, and the
// size was asked as two numbers when it is one rectangle.
//
// It is three steps now, and a step that cannot be answered yet is not shown.

// Two kinds of upload, because they want opposite treatment. Art drawn to match
// the UI must not be touched at all; a photograph has to be cropped to the space
// it occupies and dithered, because the panel has no grey.
const MODES = [
  { id: "photo", label: "Photo", hint: "Cropped to fill, then dithered" },
  { id: "exact", label: "Pixel accurate", hint: "Kept at its own size, no dithering" },
];

const SIZE_MODES = [
  { id: "grid", label: "On the grid" },
  { id: "full", label: "Full screen" },
  { id: "custom", label: "Custom" },
];

// Same arithmetic as the firmware's Grid.h, driven by the manifest so the two
// cannot drift apart.
function cellSize(grid, cols, rows) {
  return {
    width: cols * grid.unit_w + (cols - 1) * grid.gap,
    height: rows * grid.unit_h + (rows - 1) * grid.gap,
  };
}

function prettyBytes(bytes) {
  return bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
}

const DownloadedIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3v10m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);

const PendingIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 18a4 4 0 0 1 .5-8 6 6 0 0 1 11.4 2A3.5 3.5 0 0 1 18 18z" />
  </svg>
);

// How many of an album's photographs the panel can show, in a line.
//
// "25 of 35 rendered" was reported as a fault, and fairly: it is the limit
// doing exactly what it was set to, and nothing in that sentence says so. It
// reads as a job that stalled ten short. So when the limit is what is holding
// photos back, the line says the limit is what is holding photos back.
function albumProgress(album) {
  if (album.last_error) return "could not be read";
  if (!album.available) return "not read yet";

  const kept = Math.min(album.limit, album.available);
  if (album.rendered < kept) return `rendering · ${album.rendered} of ${kept}`;
  if (album.available > album.limit) {
    return `newest ${album.limit} of ${album.available}`;
  }
  return album.available === 1 ? "1 photo" : `all ${album.available} photos`;
}

// Three states, not two: the device might not be reporting at all, which is
// different from it reporting that it has nothing.
function DeviceBadge({ name, have, reports }) {
  if (!reports) {
    return (
      <span className="badge unknown" title="The device has not reported yet">
        <PendingIcon /> unknown
      </span>
    );
  }
  if (have.includes(name)) {
    return (
      <span className="badge ok" title="On the device's SD card">
        <DownloadedIcon /> on device
      </span>
    );
  }
  return (
    <span className="badge waiting" title="Uploaded, not yet fetched by the device">
      <PendingIcon /> not yet
    </span>
  );
}

export default function ImagesTab({ grid, panel, onMessage }) {
  const [images, setImages] = useState([]);
  const [baseUrl, setBaseUrl] = useState("");
  const [onDevice, setOnDevice] = useState([]);
  const [deviceReports, setDeviceReports] = useState(false);
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [mode, setMode] = useState("photo");
  // On by default: a photo among widgets looks like a mistake with square
  // corners. Only meaningful for a photo -- "exact" exists so that what was
  // drawn is what is drawn.
  const [rounded, setRounded] = useState(true);
  // Applied before the dither, in the browser. On a panel with no grey these
  // matter more than the crop does: a slightly dark photo turns to mud, and a
  // nudge of contrast often rescues one that looked hopeless.
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [ditherName, setDitherName] = useState("atkinson");
  // The editor hands back a function that renders the upload, rather than the
  // bytes, so dragging does not encode a PNG on every frame.
  //
  // A ref and not state, for two reasons that are both easy to get wrong here:
  // useState treats a function argument as an updater and would call it instead
  // of storing it, and a setter passed straight down would change identity every
  // render and spin the editor's effect.
  const renderUpload = useRef(null);
  const onEditorReady = useCallback((render) => {
    renderUpload.current = render;
  }, []);
  const [cols, setCols] = useState(2);
  const [rows, setRows] = useState(1);
  const [sizeMode, setSizeMode] = useState("grid");
  const [customWidth, setCustomWidth] = useState(400);
  const [customHeight, setCustomHeight] = useState(300);
  const [busy, setBusy] = useState(false);
  // Which stored picture the library is showing, when nothing is being uploaded
  const [selected, setSelected] = useState(null);
  const fileInput = useRef(null);

  // Photo albums. They live on this screen rather than on the photo widget
  // because an album is a *source*: configured once, shown by any number of
  // widgets. Asking for the share link inside a widget's options would mean
  // pasting it again per widget, with no one place to see what is configured.
  const [albums, setAlbums] = useState([]);
  const [albumRefresh, setAlbumRefresh] = useState({});
  const [pickedAlbum, setPickedAlbum] = useState(null);
  const [addingAlbum, setAddingAlbum] = useState(false);
  const [albumUrl, setAlbumUrl] = useState("");
  const [albumName, setAlbumName] = useState("");
  const [albumLimit, setAlbumLimit] = useState(25);
  const [albumBusy, setAlbumBusy] = useState(false);

  // The photo picker. `picker` is what the backend last told us about the open
  // album; `marks` is the set of guids ticked in the grid, which is local until
  // Save -- choosing photographs is a fiddly, several-click job and committing
  // each tick would fire a re-render of the whole album per click.
  const [picker, setPicker] = useState(null);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const [marks, setMarks] = useState(null);

  const reload = () =>
    api
      .getImages()
      .then((data) => {
        setImages(data.images || []);
        setBaseUrl(data.base_url || "");
        setOnDevice(data.device?.have || []);
        setDeviceReports(Boolean(data.device_reports));
      })
      .catch((problem) => onMessage(problem.message));

  const reloadAlbums = () =>
    api
      .getAlbums()
      .then((data) => {
        setAlbums(data.albums || []);
        setAlbumRefresh(data.refresh || {});
      })
      .catch((problem) => onMessage(problem.message));

  useEffect(() => {
    reload();
    // The device reports on its own timer, so a freshly uploaded image turns
    // from "not yet" to "on device" a minute or so later without a page reload.
    const timer = setInterval(reload, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    reloadAlbums();
    // Faster than the image poll: rendering runs in the background at seconds a
    // picture, and the counts and the progress line only move if this asks.
    const timer = setInterval(reloadAlbums, 5000);
    return () => clearInterval(timer);
  }, []);

  const target = useMemo(() => {
    if (sizeMode === "full") return { width: panel.width, height: panel.height };
    if (sizeMode === "custom") {
      // Clamped to the panel, which is what the backend enforces anyway
      return {
        width: Math.min(Math.max(1, customWidth || 0), panel.width),
        height: Math.min(Math.max(1, customHeight || 0), panel.height),
      };
    }
    return cellSize(grid, cols, rows);
  }, [sizeMode, panel, grid, cols, rows, customWidth, customHeight]);

  const pick = (chosen) => {
    setFile(chosen);
    // Saves typing, and the backend sanitises whatever lands here anyway
    if (chosen && !name) setName(chosen.name.replace(/\.[^.]+$/, ""));
  };

  const reset = () => {
    setFile(null);
    setName("");
    setBrightness(0);
    setContrast(0);
    if (fileInput.current) fileInput.current.value = "";
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      // A photo goes up as the greyscale the editor rendered and previewed, so
      // what ships is dithered from exactly those pixels. "Pixel accurate" has
      // no geometry to decide and goes up as the file itself.
      const prepared = mode === "photo" && Boolean(renderUpload.current);
      const payload = prepared ? await renderUpload.current() : file;
      if (!payload) throw new Error("The editor has nothing to upload yet.");

      const entry = await api.uploadImage({
        file: payload,
        name,
        mode,
        width: target.width,
        height: target.height,
        rounded: mode === "photo" && rounded,
        dither: ditherName,
        prepared,
      });
      onMessage(`Uploaded ${entry.name} (${entry.width}×${entry.height})`);
      reset();
      reload();
    } catch (problem) {
      onMessage(problem.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (image) => {
    if (!window.confirm(`Delete "${image.name}"? Any widget showing it will go blank.`)) return;
    try {
      await api.deleteImage(image.name);
      onMessage(`Deleted ${image.name}`);
      reload();
    } catch (problem) {
      onMessage(problem.message);
    }
  };
  // Only one thing is ever on the right, so choosing any of them clears the
  // rest. Without this, opening an album while a picture was being cropped left
  // both panes rendered one under the other.
  const showOnly = (what) => {
    if (what !== "upload") reset();
    if (what !== "image") setSelected(null);
    if (what !== "album") setPickedAlbum(null);
    if (what !== "album") {
      // The grid is several hundred KB of thumbnails and a set of ticks that
      // were never saved. Both belong to the album that was open, so leaving
      // them behind would show one album's photographs under another's name.
      setPicker(null);
      setMarks(null);
      setPickerError("");
    }
    setAddingAlbum(what === "new-album");
  };

  const addAlbum = async () => {
    if (!albumUrl.trim()) return;
    setAlbumBusy(true);
    try {
      const album = await api.addAlbum({ url: albumUrl, name: albumName, limit: albumLimit });
      onMessage(`Added ${album.name} — ${album.available} photos, rendering now`);
      setAlbumUrl("");
      setAlbumName("");
      showOnly("album");
      setPickedAlbum(album.id);
      reloadAlbums();
    } catch (problem) {
      onMessage(problem.message);
    } finally {
      setAlbumBusy(false);
    }
  };

  const removeAlbum = async (album) => {
    if (
      !window.confirm(
        `Remove "${album.name}"? Any photo widget showing it will go blank, and its ` +
          `pictures will be deleted from the panel.`
      )
    )
      return;
    try {
      await api.deleteAlbum(album.id);
      onMessage(`Removed ${album.name}`);
      setPickedAlbum(null);
      reloadAlbums();
    } catch (problem) {
      onMessage(problem.message);
    }
  };

  const refreshAlbumsNow = async () => {
    try {
      await api.refreshAlbums();
      onMessage("Checking the albums for new photos…");
      reloadAlbums();
    } catch (problem) {
      onMessage(problem.message);
    }
  };

  // Reading an album is two round trips to Apple, so the grid is fetched when
  // one is opened rather than kept for all of them.
  const openPicker = async (albumId, force = false) => {
    setPickerBusy(true);
    setPickerError("");
    try {
      const data = await api.getAlbumPhotos(albumId, force);
      setPicker(data);
      setMarks(new Set(data.photos.filter((one) => one.chosen).map((one) => one.guid)));
    } catch (problem) {
      setPicker(null);
      setMarks(null);
      setPickerError(problem.message);
    } finally {
      setPickerBusy(false);
    }
  };

  const toggleMark = (guid) =>
    setMarks((current) => {
      const next = new Set(current);
      if (next.has(guid)) next.delete(guid);
      else next.add(guid);
      return next;
    });

  const saveSelection = async () => {
    if (!picker || !marks) return;
    if (marks.size === 0) {
      setPickerError(
        "Choose at least one photograph — a widget with none to draw says ALBUM IS EMPTY on the panel."
      );
      return;
    }
    setPickerBusy(true);
    setPickerError("");
    try {
      await api.setAlbumSelection(picker.id, [...marks]);
      onMessage(
        `Showing ${marks.size} photo${marks.size === 1 ? "" : "s"} from ${picker.name} — rendering now`
      );
      await openPicker(picker.id);
      reloadAlbums();
    } catch (problem) {
      setPickerError(problem.message);
    } finally {
      setPickerBusy(false);
    }
  };

  // Back to "the newest N", which is what an album nobody has opened this for
  // already does. Its own action rather than an empty selection, which the
  // backend refuses for being indistinguishable from a mistake.
  const clearSelection = async () => {
    if (!picker) return;
    setPickerBusy(true);
    setPickerError("");
    try {
      await api.setAlbumSelection(picker.id, null);
      onMessage(`${picker.name} is back to its photo limit`);
      await openPicker(picker.id);
      reloadAlbums();
    } catch (problem) {
      setPickerError(problem.message);
    } finally {
      setPickerBusy(false);
    }
  };

  const marked = marks ? marks.size : 0;
  // Whether the grid differs from what the backend is acting on, which is what
  // decides if Save is worth offering.
  const pickerDirty =
    picker && marks
      ? picker.photos.some((one) => one.chosen !== marks.has(one.guid))
      : false;

  const held = images.find((one) => one.name === selected) || null;
  const album = albums.find((one) => one.id === pickedAlbum) || null;
  const editing = Boolean(file);
  const albumPictures = albums.reduce((total, one) => total + (one.rendered || 0), 0);
  const ditherOf = (entry) => (entry.mode === "exact" ? "threshold" : entry.dither || "atkinson");

  return (
    <div className="images-tab">
      <div className="side-column">
        <div>
          <div className="eyebrow">
            {images.length} held
            {deviceReports ? ` · panel holds ${onDevice.length}` : ""}
          </div>
          <h2 style={{ fontSize: 24 }}>Images</h2>
        </div>

        <div className="image-list">
          {images.map((image) => {
            // Three states, not two: the panel might not be reporting at all,
            // which is different from it reporting that it has nothing.
            const missing = deviceReports && !onDevice.includes(image.name);
            const active = !editing && selected === image.name;
            return (
              <button
                key={image.name}
                className={`image-row${active ? " active" : ""}${missing ? " missing" : ""}`}
                onClick={() => {
                  showOnly("image");
                  setSelected(image.name);
                }}
              >
                {missing ? (
                  <span className="image-row-thumb">
                    <WarningIcon size={18} />
                  </span>
                ) : (
                  <img className="image-row-thumb" src={api.imagePreviewUrl(image.name)} alt="" draggable={false} />
                )}
                <span className="image-row-text">
                  <b>{image.name}</b>
                  <small>
                    {missing
                      ? "not on the panel yet"
                      : `${image.width} × ${image.height} · ${ditherOf(image)} · ${prettyBytes(image.bytes)}`}
                  </small>
                </span>
              </button>
            );
          })}

          <button className="add-button stacked" onClick={() => fileInput.current?.click()}>
            + Upload a picture
            <span style={{ fontWeight: 400, fontSize: 11 }}>Names: a–z, 0–9, _ and -, up to 32</span>
          </button>

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              showOnly("upload");
              pick(event.target.files?.[0] || null);
            }}
          />
        </div>

        {/* Albums are a second library on this screen, not a section inside the
            first: a picture is something you framed, an album is a source that
            fills itself. They share the column because both answer "what can a
            widget show", and both are chosen the same way. */}
        <div>
          <div className="eyebrow">
            {albums.length} album{albums.length === 1 ? "" : "s"}
            {albumPictures ? ` · ${albumPictures} pictures` : ""}
          </div>
          <h2 style={{ fontSize: 24 }}>Albums</h2>
        </div>

        <div className="image-list">
          {albums.map((one) => (
            <button
              key={one.id}
              className={`image-row${pickedAlbum === one.id ? " active" : ""}${
                one.last_error ? " missing" : ""
              }`}
              onClick={() => {
                showOnly("album");
                setPickedAlbum(one.id);
                openPicker(one.id);
              }}
            >
              <span className="image-row-thumb">
                {one.last_error ? <WarningIcon size={18} /> : <ImageIcon size={18} />}
              </span>
              <span className="image-row-text">
                <b>{one.name}</b>
                <small>{albumProgress(one)}</small>
              </span>
            </button>
          ))}

          <button
            className="add-button stacked"
            onClick={() => {
              showOnly("new-album");
            }}
          >
            + Add an iCloud album
            <span style={{ fontWeight: 400, fontSize: 11 }}>
              A shared album's Public Website link
            </span>
          </button>
        </div>

        {!baseUrl && (
          <div className="note danger">
            <div className="note-head">
              <WarningIcon size={16} />
              The panel cannot download images yet
            </div>
            <p>
              The add-on could not work out your Home Assistant address by itself. Set{" "}
              <code>image_base_url</code> in this add-on's <b>Configuration</b> tab — for example{" "}
              <code>http://192.168.1.50:8098</code> — then restart it. Uploading and previewing
              work regardless; only the download to the panel is affected.
            </p>
          </div>
        )}
      </div>

      <section className="card">
        {!editing && !held && !album && !addingAlbum && (
          <>
            <div className="eyebrow">Nothing selected</div>
            <p className="hint" style={{ marginTop: 8 }}>
              Choose a picture to see exactly what the panel draws, or upload a new one. The
              preview is the stored bitmap, so it is the real dither rather than an impression
              of it. An album fills itself instead — a photo widget rotates through one.
            </p>
          </>
        )}

        {album && (
          <>
            <div className="screen-head">
              <div>
                <div className="eyebrow">iCloud shared album</div>
                <h3 style={{ fontSize: 21 }}>{album.name}</h3>
              </div>
              <button
                style={{ marginLeft: "auto" }}
                onClick={refreshAlbumsNow}
                disabled={albumRefresh.running}
              >
                <RefreshIcon size={14} />
                {albumRefresh.running ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            {albumRefresh.running && (
              <div className="note info" style={{ marginTop: 16 }}>
                <div className="note-head">
                  {albumRefresh.album ? `Reading ${albumRefresh.album}` : "Reading the albums"}
                </div>
                <p>
                  Rendered {albumRefresh.rendered || 0}
                  {albumRefresh.total ? ` of ${albumRefresh.total}` : ""} pictures. Each is
                  cropped and dithered here, which takes a few seconds.
                </p>
              </div>
            )}

            {album.last_error && (
              <div className="note danger" style={{ marginTop: 16 }}>
                <div className="note-head">
                  <WarningIcon size={16} />
                  iCloud would not give us this album
                </div>
                <p>
                  {album.last_error} The pictures already on the panel are kept, so the widget
                  carries on showing them.
                </p>
              </div>
            )}

            <div
              className="facts"
              style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: 16 }}
            >
              <div className="fact">
                <small>In the album</small>
                <b>{album.available}</b>
              </div>
              <div className="fact">
                <small>Showing</small>
                <b>
                  {picker
                    ? marked
                    : Math.min(album.limit, album.available || album.limit)}
                </b>
              </div>
              <div className="fact">
                {/* Photographs ready, not files: each widget shape is its own
                    set of renderings, and adding them up says more pictures
                    exist than the album holds. */}
                <small>Ready</small>
                <b className={album.rendered ? "ok" : undefined}>{album.rendered}</b>
              </div>
            </div>

            {album.sets > 1 && (
              <p className="hint">
                Rendered {album.sets} times over — once for each size, crop and border
                the widgets showing this album use.
              </p>
            )}

            {/* The picker. This replaced a "keep the newest N" slider: a
                number is a poor way to say which photographs you want, and the
                only way to find out what it had picked was to walk over to the
                panel and wait for the rotation to come round. */}
            {pickerError && (
              <div className="note danger" style={{ marginTop: 16 }}>
                <div className="note-head">
                  <WarningIcon size={16} />
                  Could not show this album's photos
                </div>
                <p>{pickerError}</p>
              </div>
            )}

            {!picker && pickerBusy && (
              <p className="hint" style={{ marginTop: 16 }}>
                Reading the album from iCloud…
              </p>
            )}

            {picker && (
              <>
                <div className="screen-head" style={{ marginTop: 20 }}>
                  <div>
                    <div className="eyebrow">
                      {marked} of {picker.photos.length} chosen
                      {picker.explicit ? "" : " · by the photo limit, not by hand"}
                    </div>
                    <h4 style={{ fontSize: 16, margin: 0 }}>Which photos to show</h4>
                  </div>
                  <button
                    style={{ marginLeft: "auto" }}
                    onClick={() => setMarks(new Set(picker.photos.map((one) => one.guid)))}
                    disabled={pickerBusy || marked === picker.photos.length}
                  >
                    All
                  </button>
                  <button onClick={() => setMarks(new Set())} disabled={pickerBusy || !marked}>
                    None
                  </button>
                  <button onClick={() => openPicker(picker.id, true)} disabled={pickerBusy}>
                    <RefreshIcon size={14} />
                    Check again
                  </button>
                </div>

                {!picker.explicit && (
                  <p className="hint">
                    Nothing has been chosen by hand, so the newest {picker.limit} are shown.
                    Tick the ones you want and save to choose for yourself.
                  </p>
                )}

                <div className="album-grid">
                  {picker.photos.map((photo) => {
                    const on = marks.has(photo.guid);
                    return (
                      <button
                        key={photo.guid}
                        type="button"
                        className={`album-tile${on ? " chosen" : ""}`}
                        onClick={() => toggleMark(photo.guid)}
                        aria-pressed={on}
                        title={photo.caption || undefined}
                      >
                        <img
                          src={api.albumThumbUrl(picker.id, photo.guid)}
                          alt={photo.caption || "Album photo"}
                          loading="lazy"
                        />
                        <span className="album-tick" aria-hidden="true">
                          {on ? <CheckIcon size={13} /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="upload-actions">
                  <p className="hint">
                    {/* Said plainly because it is the one surprise here: the
                        panel downloads by position, so changing the set makes
                        it re-fetch the pictures after the change. */}
                    Changing which photos are shown renumbers the album, so the panel
                    re-fetches the ones that moved. Each is a few seconds of rendering.
                  </p>
                  <button
                    className="primary"
                    onClick={saveSelection}
                    disabled={pickerBusy || !pickerDirty}
                  >
                    {pickerBusy ? "Saving…" : `Show these ${marked}`}
                  </button>
                  {picker.explicit && (
                    <button onClick={clearSelection} disabled={pickerBusy}>
                      Use the limit instead
                    </button>
                  )}
                </div>
              </>
            )}

            <div className="upload-actions">
              <p className="hint">
                Pictures are rendered only for the widgets that show them, at each size, crop
                and border in use — so a bigger album is a slower refresh and a fuller card.
                Widgets showing this album go blank if it is removed.
              </p>
              <button className="danger" onClick={() => removeAlbum(album)}>
                <TrashIcon size={14} />
                Remove
              </button>
            </div>
          </>
        )}

        {addingAlbum && (
          <>
            <div className="screen-head">
              <div>
                <div className="eyebrow">iCloud shared album</div>
                <h3 style={{ fontSize: 21 }}>Add an album</h3>
              </div>
            </div>

            <label className="field-block" style={{ marginTop: 16 }}>
              <span>Share link</span>
              <input
                value={albumUrl}
                onChange={(event) => setAlbumUrl(event.target.value)}
                placeholder="https://www.icloud.com/sharedalbum/#B0z5qAGN1JIFd3y"
              />
            </label>

            <div className="note info" style={{ marginTop: 12 }}>
              <div className="note-head">Where to find it</div>
              <p>
                In Photos, open the album, share it, and turn on <b>Public Website</b> — then
                paste the link it gives you. Nothing is signed in to: the link is all iCloud
                needs, and the add-on only ever reads.
              </p>
            </div>

            <label className="field-block" style={{ marginTop: 16 }}>
              <span>Name (optional)</span>
              <input
                value={albumName}
                onChange={(event) => setAlbumName(event.target.value)}
                placeholder="whatever the album is called"
              />
            </label>

            <label className="field-block" style={{ marginTop: 16 }}>
              <span className="slider-head">
                Keep the newest <b>{albumLimit}</b>
              </span>
              <input
                type="range"
                className="track-cool"
                style={{ "--fill": `${albumLimit}%` }}
                min="1"
                max="100"
                value={albumLimit}
                onChange={(event) => setAlbumLimit(Number(event.target.value))}
              />
            </label>

            <div className="upload-actions">
              <p className="hint">
                The link is checked with iCloud before the album is saved. Rendering its
                pictures happens afterwards and takes a few seconds each.
              </p>
              <button className="primary" disabled={albumBusy || !albumUrl.trim()} onClick={addAlbum}>
                {albumBusy ? "Checking…" : "Add album"}
              </button>
              <button onClick={() => showOnly(null)} disabled={albumBusy}>
                Cancel
              </button>
            </div>
          </>
        )}

        {held && !editing && (
          <>
            <div className="screen-head">
              <div>
                <div className="eyebrow">Stored · the real dither</div>
                <h3 style={{ fontSize: 21 }}>{held.name}</h3>
              </div>
            </div>

            <div className="editor-split" style={{ marginTop: 16 }}>
              <div className="editor-stage">
                <div className="editor-figure">
                  <img src={api.imagePreviewUrl(held.name)} alt={held.name} />
                  <span className="crop-tag result">
                    1-bit · {held.width} × {held.height}
                  </span>
                </div>
              </div>

              <div className="editor-controls">
                <div className="facts" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <div className="fact">
                    <small>Size</small>
                    <b>{held.width} × {held.height}</b>
                  </div>
                  <div className="fact">
                    <small>Dither</small>
                    <b>{ditherOf(held)}</b>
                  </div>
                  <div className="fact">
                    <small>Stored</small>
                    <b>{prettyBytes(held.bytes)}</b>
                  </div>
                  <div className="fact">
                    <small>On the panel</small>
                    <b className={onDevice.includes(held.name) ? "ok" : undefined}>
                      {deviceReports ? (onDevice.includes(held.name) ? "Yes" : "Not yet") : "Unknown"}
                    </b>
                  </div>
                </div>
                <button className="danger" onClick={() => remove(held)}>
                  <TrashIcon size={14} />
                  Delete
                </button>
              </div>
            </div>

            <div className="upload-actions">
              <p className="hint">
                This is the stored bitmap, the same bytes the panel fetches. Deleting it blanks
                any widget showing it.
              </p>
            </div>
          </>
        )}

        {editing && (
          <>
            <div className="screen-head">
              <div>
                <div className="eyebrow">Crop · preview is the real dither</div>
                <h3 style={{ fontSize: 21 }}>{name || "New picture"}</h3>
              </div>
              <div className="seg" role="group" aria-label="Kind" style={{ marginLeft: "auto" }}>
                {MODES.map((entry) => (
                  <button
                    key={entry.id}
                    className={mode === entry.id ? "active" : undefined}
                    onClick={() => setMode(entry.id)}
                    title={entry.hint}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>

            {mode === "photo" ? (
              <div style={{ marginTop: 16 }}>
                <ImageEditor
                  file={file}
                  target={target}
                  ditherName={ditherName}
                  brightness={brightness}
                  contrast={contrast}
                  onReady={onEditorReady}
                >
                  <label className="field-block">
                    <span className="slider-head">
                      Brightness <b>{brightness > 0 ? `+${brightness}` : brightness}</b>
                    </span>
                    <input
                      type="range"
                      className="track-warm"
                      style={{ "--fill": `${(brightness + 100) / 2}%` }}
                      min="-100"
                      max="100"
                      value={brightness}
                      onChange={(event) => setBrightness(Number(event.target.value))}
                    />
                  </label>

                  <label className="field-block">
                    <span className="slider-head">
                      Contrast <b>{contrast > 0 ? `+${contrast}` : contrast}</b>
                    </span>
                    <input
                      type="range"
                      className="track-cool"
                      style={{ "--fill": `${(contrast + 100) / 2}%` }}
                      min="-100"
                      max="100"
                      value={contrast}
                      onChange={(event) => setContrast(Number(event.target.value))}
                    />
                  </label>

                  {/* A group rather than a <label>: a label wrapping several
                      buttons hands each of them the others' text as its name. */}
                  <div className="field-block inspector-section" role="group" aria-label="Dither">
                    <span>Dither</span>
                    <div className="choice-cards">
                      {Object.entries(DITHERS).map(([id, entry]) => (
                        <button
                          key={id}
                          className={ditherName === id ? "choice active" : "choice"}
                          onClick={() => setDitherName(id)}
                          aria-pressed={ditherName === id}
                          title={entry.hint}
                        >
                          <span className="choice-mark" />
                          <b>{entry.label}</b>
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="solid switch">
                    <span>
                      <b style={{ fontSize: 12.5 }}>Round the corners</b>
                      <small className="hint" style={{ display: "block" }}>
                        matches the widget radius
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      style={{ marginLeft: "auto" }}
                      checked={rounded}
                      onChange={(event) => setRounded(event.target.checked)}
                    />
                  </label>
                </ImageEditor>

                <div className="upload-size">
                  <label className="field">
                    <span>Name</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="hallway"
                    />
                  </label>

                  <div className="field-block" role="group" aria-label="Size on the panel">
                    <span>Size on the panel — {target.width} × {target.height}</span>
                    <div className="pill-row">
                      {SIZE_MODES.map((entry) => (
                        <button
                          key={entry.id}
                          className={sizeMode === entry.id ? "pill active" : "pill"}
                          onClick={() => setSizeMode(entry.id)}
                        >
                          {entry.label}
                        </button>
                      ))}
                    </div>
                    {sizeMode === "grid" && (
                      <div style={{ marginTop: 10 }}>
                        <GridSizePicker
                          grid={grid}
                          cols={cols}
                          rows={rows}
                          onChange={(nextCols, nextRows) => {
                            setCols(nextCols);
                            setRows(nextRows);
                          }}
                        />
                      </div>
                    )}
                    {sizeMode === "custom" && (
                      <div className="custom-size" style={{ marginTop: 10 }}>
                        <label className="field">
                          <span>Width</span>
                          <input
                            type="number"
                            min="1"
                            max={panel.width}
                            value={customWidth}
                            onChange={(event) => setCustomWidth(Number(event.target.value))}
                          />
                        </label>
                        <label className="field">
                          <span>Height</span>
                          <input
                            type="number"
                            min="1"
                            max={panel.height}
                            value={customHeight}
                            onChange={(event) => setCustomHeight(Number(event.target.value))}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <label className="field" style={{ marginTop: 16 }}>
                  <span>Name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="hallway"
                  />
                </label>
                <p className="hint" style={{ marginTop: 12 }}>
                  Uploaded as-is at its own pixel size, with anything darker than mid-grey
                  becoming black. Draw it at the size you want it drawn.
                </p>
              </>
            )}

            <div className="upload-actions">
              <p className="hint" style={{ maxWidth: 460 }}>
                {mode === "photo"
                  ? "Uploads as a greyscale bitmap at final size, so the backend only packs it — the preview and the panel agree pixel for pixel."
                  : "Uploaded exactly as drawn, thresholded rather than dithered."}
              </p>
              <button className="spacer" onClick={reset}>
                Cancel
              </button>
              <button className="primary" disabled={busy} onClick={upload}>
                {busy ? "Converting…" : "Upload"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
