// Relative paths throughout: Home Assistant serves the add-on under an ingress
// path prefix, so anything rooted at / would escape it.
const base = "api";

// Which panel the editor is showing.
//
// Module state rather than an argument on forty call sites, because it is
// genuinely one value: the editor shows one panel at a time, and every request
// about a dashboard, a setting or a command is about that one. App sets it
// before it loads anything and again whenever the dropdown changes.
//
// Only the panel-scoped calls carry it. The entity list, the areas, the images
// and the albums are the installation's, not a panel's, and appending it there
// would imply a per-panel answer that does not exist.
let panel = null;

export const setPanel = (id) => {
  panel = id || null;
};

export const currentPanel = () => panel;

const scoped = (path) => {
  if (!panel) return path;
  return `${path}${path.includes("?") ? "&" : "?"}panel=${encodeURIComponent(panel)}`;
};

async function request(path, options) {
  const response = await fetch(`${base}/${path}`, options);
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail || `${response.status} ${response.statusText}`);
  }
  return response.json();
}

// The panels themselves, for the dropdown. Not scoped -- it is the list the
// scoping is chosen from.
export const getPanels = () => request("panels");

export const renamePanel = (id, name) =>
  request(`panels/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

export const forgetPanel = (id) =>
  request(`panels/${encodeURIComponent(id)}`, { method: "DELETE" });

export const getStatus = () => request(scoped("status"));
export const getHistory = () => request(scoped("history"));
export const getLayout = () => request(scoped("layout"));
export const getEntities = () => request("entities");
export const getDevices = () => request("devices");
export const getAreas = () => request("areas");

export const saveLayout = (layout) =>
  request(scoped("layout"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(layout),
  });

export const pushLayout = () => request(scoped("push"), { method: "POST" });
export const refreshDevice = () => request(scoped("refresh"), { method: "POST" });
export const sendToSetup = () => request(scoped("onboard"), { method: "POST" });
export const showDeviceInfo = () => request(scoped("device-info"), { method: "POST" });
export const showPage = (id) =>
  request(scoped(`page/${encodeURIComponent(id)}`), { method: "POST" });
export const setPageLock = (locked) =>
  request(scoped(`page-lock/${locked ? "on" : "off"}`), { method: "POST" });

// Scoped for the "what the panel has of them" half of the answer: the images
// are shared, but which of them a given panel is holding is that panel's.
export const getImages = () => request(scoped("images"));

// What the panel sends back about itself. Asking is a command over MQTT, so it
// returns as soon as the broker has it -- the upload lands seconds later, on
// the device's own next loop, and is noticed by polling for it.
export const askForScreenshot = () => request(scoped("screenshot"), { method: "POST" });
export const getScreenshot = () => request(scoped("screenshot"));
export const askForLogs = () => request(scoped("logs"), { method: "POST" });
export const getLogs = () => request(scoped("logs"));
export const clearLogs = () => request(scoped("logs"), { method: "DELETE" });

// The picture itself. The URL never changes, so the capture time is appended to
// get past the browser cache -- a stale screenshot of a dashboard is impossible
// to tell from a current one.
export const screenshotUrl = (takenAt) => {
  const parts = [];
  if (panel) parts.push(`panel=${encodeURIComponent(panel)}`);
  if (takenAt) parts.push(`t=${Math.round(takenAt)}`);
  return `${base}/screenshot.png${parts.length ? `?${parts.join("&")}` : ""}`;
};

export const getFirmware = () => request(scoped("firmware"));
export const checkFirmware = () => request("firmware/check", { method: "POST" });
export const updateFirmware = () => request(scoped("firmware/update"), { method: "POST" });

// The boundary is left to the browser, so no Content-Type header here
export const uploadImage = ({
  file,
  name,
  mode,
  width,
  height,
  rounded,
  dither = "atkinson",
  prepared = false,
}) => {
  const form = new FormData();
  // A prepared upload is a greyscale PNG the editor rendered, not the file the
  // user chose, so it needs a filename of its own -- FormData will not infer
  // one from a Blob, and passing undefined as the third argument is not the
  // same as omitting it: the spec stringifies it to "undefined".
  if (prepared) form.append("file", file, `${name || "image"}.png`);
  else form.append("file", file);
  form.append("name", name || "");
  form.append("mode", mode);
  form.append("width", String(width || 0));
  form.append("height", String(height || 0));
  // FastAPI parses "true"/"false" for a bool form field; a bare boolean would
  // arrive as the string "undefined" when it is false.
  form.append("rounded", rounded ? "true" : "false");
  form.append("dither", dither);
  form.append("prepared", prepared ? "true" : "false");
  return request("images", { method: "POST", body: form });
};

export const deleteImage = (name) =>
  request(`images/${encodeURIComponent(name)}`, { method: "DELETE" });

// What the panel will actually show, dithering and all
export const imagePreviewUrl = (name) => `${base}/images/${encodeURIComponent(name)}/preview.png`;

// Photo albums. Adding one checks the link with iCloud before it returns, so
// this can take a second; rendering the pictures happens afterwards in the
// background and is followed by polling getAlbums().
export const getAlbums = () => request("albums");

export const addAlbum = ({ url, name, limit }) =>
  request("albums", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, name, limit }),
  });

export const deleteAlbum = (id) =>
  request(`albums/${encodeURIComponent(id)}`, { method: "DELETE" });

export const refreshAlbums = () => request("albums/refresh", { method: "POST" });

// Every photograph in an album, whether or not the panel renders it, so the
// picker can offer the ones it is not showing. `force` skips the backend's
// short cache, for the Check again button.
export const getAlbumPhotos = (id, force = false) =>
  request(`albums/${encodeURIComponent(id)}/photos${force ? "?force=true" : ""}`);

// Which photographs to show. null hands the album back to its limit.
export const setAlbumSelection = (id, selected) =>
  request(`albums/${encodeURIComponent(id)}/selection`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selected }),
  });

// Small copies for the picker, served by the add-on because iCloud's own URLs
// are signed and expire. Immutable, so no cache-busting parameter.
export const albumThumbUrl = (id, guid) =>
  `${base}/albums/${encodeURIComponent(id)}/photos/${encodeURIComponent(guid)}/thumb.jpg`;
