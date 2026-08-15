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

export const saveLayout = (layout) =>
  request("layout", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(layout),
  });

export const pushLayout = () => request("push", { method: "POST" });
export const refreshDevice = () => request("refresh", { method: "POST" });
