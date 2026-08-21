import { useEffect, useMemo, useRef, useState } from "react";

import * as api from "./api.js";

// Two kinds of upload, because they want opposite treatment. Art drawn to match
// the UI must not be touched at all; a photograph has to be cropped to the space
// it occupies and dithered, because the panel has no grey.
const MODES = [
  {
    id: "exact",
    label: "Pixel accurate",
    hint: "Kept at its own size, no dithering",
  },
  {
    id: "photo",
    label: "Photo",
    hint: "Cropped to fill, then dithered",
  },
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
  const [cols, setCols] = useState(2);
  const [rows, setRows] = useState(1);
  const [sizeMode, setSizeMode] = useState("grid"); // grid | full | custom
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

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const entry = await api.uploadImage({
        file,
        name,
        mode,
        width: target.width,
        height: target.height,
        rounded: mode === "photo" && rounded,
      });
      onMessage(`Uploaded ${entry.name} (${entry.width}×${entry.height})`);
      setFile(null);
      setName("");
      if (fileInput.current) fileInput.current.value = "";
      reload();
    } catch (problem) {
      onMessage(problem.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (image) => {
    try {
      await api.deleteImage(image.name);
      onMessage(`Deleted ${image.name}`);
      reload();
    } catch (problem) {
      onMessage(problem.message);
    }
  };

  return (
    <div className="images-tab">
      {baseUrl ? (
        // Worth stating even when it works: it is the one piece of this that
        // depends on your network rather than on the add-on.
        <p className="hint">
          The panel downloads images from <code>{baseUrl}</code>.
        </p>
      ) : (
        <div className="banner">
          <strong>The panel cannot download images yet.</strong> The add-on could not
          work out your Home Assistant address by itself. Open this add-on's{" "}
          <em>Configuration</em> tab and set <code>image_base_url</code> to the same
          address you use to reach Home Assistant, with port 8098 — for example{" "}
          <code>http://192.168.1.50:8098</code> — then restart the add-on. Uploading
          and previewing work regardless; only the download to the panel is affected.
        </div>
      )}

      <section className="card upload">
        <h2>Add an image</h2>

        <label>
          <span>File</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={(event) => pick(event.target.files?.[0] || null)}
          />
        </label>

        <label>
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="hallway"
          />
        </label>

        <label>
          <span>Kind</span>
          <div className="size-picker">
            {MODES.map((entry) => (
              <button
                key={entry.id}
                className={mode === entry.id ? "chip active" : "chip"}
                onClick={() => setMode(entry.id)}
              >
                {entry.label}
                <small>{entry.hint}</small>
              </button>
            ))}
          </div>
        </label>

        {/* Only photos get scaled, so only photos need a target size */}
        {mode === "photo" && (
          <label>
            <span>Size</span>
            <div className="size-picker">
              {Array.from({ length: grid.cols }, (_, index) => index + 1).map((candidate) => (
                <button
                  key={`c${candidate}`}
                  className={sizeMode === "grid" && cols === candidate ? "chip active" : "chip"}
                  onClick={() => {
                    setSizeMode("grid");
                    setCols(candidate);
                  }}
                >
                  {candidate} wide
                </button>
              ))}
            </div>
            <div className="size-picker">
              {Array.from({ length: grid.rows }, (_, index) => index + 1).map((candidate) => (
                <button
                  key={`r${candidate}`}
                  className={sizeMode === "grid" && rows === candidate ? "chip active" : "chip"}
                  onClick={() => {
                    setSizeMode("grid");
                    setRows(candidate);
                  }}
                >
                  {candidate} tall
                </button>
              ))}
              <button
                className={sizeMode === "full" ? "chip active" : "chip"}
                onClick={() => setSizeMode("full")}
              >
                Full screen
              </button>
              <button
                className={sizeMode === "custom" ? "chip active" : "chip"}
                onClick={() => setSizeMode("custom")}
              >
                Custom
              </button>
            </div>
            {/* The API has always taken any size; only this form was limited
                to the grid presets. */}
            {sizeMode === "custom" && (
              <div className="custom-size">
                <label>
                  <span>Width</span>
                  <input
                    type="number" min="1" max={panel.width} value={customWidth}
                    onChange={(event) => setCustomWidth(Number(event.target.value))}
                  />
                </label>
                <label>
                  <span>Height</span>
                  <input
                    type="number" min="1" max={panel.height} value={customHeight}
                    onChange={(event) => setCustomHeight(Number(event.target.value))}
                  />
                </label>
              </div>
            )}

            <p className="hint">
              {target.width}×{target.height} px. Anything that does not fit this shape is
              cropped from the centre.
            </p>
          </label>
        )}

        {mode === "photo" && (
          <label className="toggle">
            <input
              type="checkbox"
              checked={rounded}
              onChange={(event) => setRounded(event.target.checked)}
            />
            <span>
              Round the corners
              <small>
                To the same radius as a widget, so the photo sits among them rather than
                on top of them. The corners become white, not transparent — the panel has
                no alpha.
              </small>
            </span>
          </label>
        )}

        {mode === "exact" && (
          <p className="hint">
            Uploaded as-is at its own pixel size, with anything darker than mid-grey
            becoming black. Draw it at the size you want it drawn.
          </p>
        )}

        <button className="primary" disabled={!file || busy} onClick={upload}>
          {busy ? "Converting…" : "Upload"}
        </button>
      </section>

      <section className="card">
        <h2>Images ({images.length})</h2>
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
