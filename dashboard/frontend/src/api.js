// Relative paths throughout: Home Assistant serves the add-on under an ingress
// path prefix, so anything rooted at / would escape it.
const base = "api";

async function request(path, options) {
  const response = await fetch(`${base}/${path}`, options);
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail || `${response.status} ${response.statusText}`);
  }
  return response.json();
}

export const getStatus = () => request("status");
export const getHistory = () => request("history");
export const getLayout = () => request("layout");
export const getEntities = () => request("entities");
export const getDevices = () => request("devices");
export const getAreas = () => request("areas");

export const saveLayout = (layout) =>
  request("layout", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(layout),
  });

export const pushLayout = () => request("push", { method: "POST" });
export const refreshDevice = () => request("refresh", { method: "POST" });
export const sendToSetup = () => request("onboard", { method: "POST" });
export const showDeviceInfo = () => request("device-info", { method: "POST" });
export const showPage = (id) => request(`page/${encodeURIComponent(id)}`, { method: "POST" });
export const setPageLock = (locked) => request(`page-lock/${locked ? "on" : "off"}`, { method: "POST" });

export const getImages = () => request("images");

// What the panel sends back about itself. Asking is a command over MQTT, so it
// returns as soon as the broker has it -- the upload lands seconds later, on
// the device's own next loop, and is noticed by polling for it.
export const askForScreenshot = () => request("screenshot", { method: "POST" });
export const getScreenshot = () => request("screenshot");
export const askForLogs = () => request("logs", { method: "POST" });
export const getLogs = () => request("logs");
export const clearLogs = () => request("logs", { method: "DELETE" });

// The picture itself. The URL never changes, so the capture time is appended to
// get past the browser cache -- a stale screenshot of a dashboard is impossible
// to tell from a current one.
export const screenshotUrl = (takenAt) =>
  `${base}/screenshot.png${takenAt ? `?t=${Math.round(takenAt)}` : ""}`;

export const getFirmware = () => request("firmware");
export const checkFirmware = () => request("firmware/check", { method: "POST" });
export const updateFirmware = () => request("firmware/update", { method: "POST" });

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
