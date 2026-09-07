import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import * as api from "./api.js";
import ImageEditor from "./ImageEditor.jsx";
import GridSizePicker from "./GridSizePicker.jsx";
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
  const fileInput = useRef(null);

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

  useEffect(() => {
    reload();
    // The device reports on its own timer, so a freshly uploaded image turns
    // from "not yet" to "on device" a minute or so later without a page reload.
    const timer = setInterval(reload, 10000);
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

  return (
    <div className="tab-panel images-tab">
      {!baseUrl && (
        <div className="banner">
          <strong>The panel cannot download images yet.</strong> The add-on could not work
          out your Home Assistant address by itself. Open this add-on's{" "}
          <em>Configuration</em> tab and set <code>image_base_url</code> to the address you
          use to reach Home Assistant, with port 8098 — for example{" "}
          <code>http://192.168.1.50:8098</code> — then restart the add-on. Uploading and
          previewing work regardless; only the download to the panel is affected.
        </div>
      )}

      <section className="card upload">
        <h2>Add an image</h2>

        {/* Step one. Everything below it depends on there being a file, so
            until there is one this is the only thing on screen. */}
        <div className="step">
          <span className="step-mark">1</span>
          <div className="step-body">
            <label className="field">
              <span>Picture</span>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                onChange={(event) => pick(event.target.files?.[0] || null)}
              />
            </label>
            {file && (
              <label className="field">
                <span>Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="hallway"
                />
              </label>
            )}
          </div>
        </div>

        {file && (
          <>
            <div className="step">
              <span className="step-mark">2</span>
              <div className="step-body">
                {/* A div and not a <label>, deliberately. A label names a
                    single control, so wrapping a group of buttons in one hands
                    every button the whole label's text as its accessible name.
                    The dither group was fixed for exactly this once already;
                    these two had the same fault and kept it. */}
                <div className="field" role="group" aria-label="Kind of picture">
                  <span>Kind</span>
                  {/* Two cards rather than two chips: each carries a sentence
                      explaining what it does to the picture, and a chip lays
                      its label and its hint on one line -- which ran them
                      together as "PhotoCropped to fill, then dithered" and
                      made each one wide enough to take a row of its own. */}
                  <div className="choice-cards">
                    {MODES.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className={mode === entry.id ? "choice-card active" : "choice-card"}
                        onClick={() => setMode(entry.id)}
                      >
                        <b>{entry.label}</b>
                        <small>{entry.hint}</small>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Only photos get scaled, so only photos need a target size */}
                {mode === "photo" ? (
                  <div className="field" role="group" aria-label="Size on the panel">
                    <span>Size</span>
                    <div className="size-picker">
                      {SIZE_MODES.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className={sizeMode === entry.id ? "chip active" : "chip"}
                          onClick={() => setSizeMode(entry.id)}
                        >
                          {entry.label}
                        </button>
                      ))}
                    </div>

                    {sizeMode === "grid" && (
                      <GridSizePicker
                        grid={grid}
                        cols={cols}
                        rows={rows}
                        onChange={(nextCols, nextRows) => {
                          setCols(nextCols);
                          setRows(nextRows);
                        }}
                      />
                    )}

                    {sizeMode === "full" && (
                      <p className="hint">
                        The whole panel, {panel.width}×{panel.height}.
                      </p>
                    )}

                    {/* The API has always taken any size; only this form was
                        limited to the grid presets. Sliders rather than number
                        fields: the useful gesture here is "a bit wider", and
                        the readout carries the exact number for when it is not. */}
                    {sizeMode === "custom" && (
                      <div className="custom-size">
                        <label className="field">
                          <span>
                            Width <b>{target.width} px</b>
                          </span>
                          <input
                            type="range"
                            min="16"
                            max={panel.width}
                            step="2"
                            value={customWidth}
                            onChange={(event) => setCustomWidth(Number(event.target.value))}
                          />
                        </label>
                        <label className="field">
                          <span>
                            Height <b>{target.height} px</b>
                          </span>
                          <input
                            type="range"
                            min="16"
                            max={panel.height}
                            step="2"
                            value={customHeight}
                            onChange={(event) => setCustomHeight(Number(event.target.value))}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="hint">
                    Uploaded as-is at its own pixel size, with anything darker than
                    mid-grey becoming black. Draw it at the size you want it drawn.
                  </p>
                )}
              </div>
            </div>

            {mode === "photo" && (
              <div className="step">
                <span className="step-mark">3</span>
                <div className="step-body">
                  <span className="field-title">Framing and tone</span>
                  <div className="editor-split">
                    <ImageEditor
                      file={file}
                      target={target}
                      ditherName={ditherName}
                      brightness={brightness}
                      contrast={contrast}
                      onReady={onEditorReady}
                    />

                    <div className="editor-knobs">
                      <label className="field">
                        <span>
                          Brightness <b>{brightness > 0 ? `+${brightness}` : brightness}</b>
                        </span>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          value={brightness}
                          onChange={(event) => setBrightness(Number(event.target.value))}
                        />
                      </label>

                      <label className="field">
                        <span>
                          Contrast <b>{contrast > 0 ? `+${contrast}` : contrast}</b>
                        </span>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          value={contrast}
                          onChange={(event) => setContrast(Number(event.target.value))}
                        />
                      </label>

                      <div className="field" role="group" aria-label="Dither">
                        <span>Dither</span>
                        <div className="size-picker">
                          {Object.entries(DITHERS).map(([id, entry]) => (
                            <button
                              key={id}
                              type="button"
                              className={ditherName === id ? "chip active" : "chip"}
                              onClick={() => setDitherName(id)}
                              title={entry.hint}
                            >
                              {entry.label}
                            </button>
                          ))}
                        </div>
                        <p className="hint">{DITHERS[ditherName].hint}</p>
                      </div>

                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={rounded}
                          onChange={(event) => setRounded(event.target.checked)}
                        />
                        <span>
                          Round the corners
                          <small>
                            To a widget's radius, so the photo sits among them. The corners
                            become white, not transparent — the panel has no alpha.
                          </small>
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="upload-actions">
              <button className="primary" disabled={busy} onClick={upload}>
                {busy ? "Converting…" : `Upload ${target.width}×${target.height}`}
              </button>
              <button onClick={reset} disabled={busy}>
                Cancel
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Images ({images.length})</h2>
          {baseUrl && (
            <small className="hint">
              The panel downloads from <code>{baseUrl}</code>
            </small>
          )}
        </div>
        {images.length === 0 && <p className="hint">Nothing uploaded yet.</p>}

        <div className="image-grid">
          {images.map((image) => (
            <figure key={image.name} className="image-item">
              {/* The stored preview, so this is exactly what the panel renders */}
              <img src={api.imagePreviewUrl(image.name)} alt={image.name} />
              <figcaption>
                <strong>{image.name}</strong>
                <small>
                  {image.mode} · {image.width}×{image.height} · {prettyBytes(image.bytes)}
                </small>
                <DeviceBadge name={image.name} have={onDevice} reports={deviceReports} />
              </figcaption>
              <button className="danger" onClick={() => remove(image)}>
                Delete
              </button>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}
