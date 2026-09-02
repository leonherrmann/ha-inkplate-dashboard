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

export const saveLayout = (layout) =>
  request("layout", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(layout),
  });

export const pushLayout = () => request("push", { method: "POST" });
export const refreshDevice = () => request("refresh", { method: "POST" });
export const showDeviceInfo = () => request("device-info", { method: "POST" });
export const showPage = (id) => request(`page/${encodeURIComponent(id)}`, { method: "POST" });

export const getImages = () => request("images");

export const getFirmware = () => request("firmware");
export const checkFirmware = () => request("firmware/check", { method: "POST" });
export const updateFirmware = () => request("firmware/update", { method: "POST" });

// The boundary is left to the browser, so no Content-Type header here
export const uploadImage = ({ file, name, mode, width, height, rounded }) => {
  const form = new FormData();
  form.append("file", file);
  form.append("name", name || "");
  form.append("mode", mode);
  form.append("width", String(width || 0));
  form.append("height", String(height || 0));
  // FastAPI parses "true"/"false" for a bool form field; a bare boolean would
  // arrive as the string "undefined" when it is false.
  form.append("rounded", rounded ? "true" : "false");
  return request("images", { method: "POST", body: form });
};

export const deleteImage = (name) =>
  request(`images/${encodeURIComponent(name)}`, { method: "DELETE" });

// What the panel will actually show, dithering and all
export const imagePreviewUrl = (name) => `${base}/images/${encodeURIComponent(name)}/preview.png`;
