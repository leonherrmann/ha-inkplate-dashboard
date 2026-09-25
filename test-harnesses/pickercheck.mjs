// WebKit pass over the album photo picker. Editor bugs in this repo have been
// Safari-only before now, so a Chromium run proves nothing.
import { webkit } from "playwright";

const BASE = "http://127.0.0.1:8127";
let passes = 0, failures = 0;
const check = (ok, what) => {
  if (ok) { passes++; console.log("ok   " + what); }
  else { failures++; console.log("FAIL " + what); }
};

const PHOTOS = Array.from({ length: 6 }, (_, n) => ({
  guid: `g${n}`, width: 1600, height: 1067,
  created: `2026-09-0${n}`, caption: "", chosen: n < 2,
}));

let saved = null;
let selectionBody = null;

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.route("**/api/**", async (route) => {
  const url = route.request().url();
  const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  if (/\/thumb\.jpg/.test(url)) {
    // 1x1 gif, so the tiles have something real to lay out around.
    return route.fulfill({ status: 200, contentType: "image/gif",
      body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") });
  }
  if (/\/albums\/[^/]+\/photos(\?|$)/.test(url)) {
    return json({ id: "demo", name: "Demo", explicit: saved !== null, limit: 25,
      rendered_count: 2,
      photos: PHOTOS.map((p) => ({ ...p, chosen: saved ? saved.includes(p.guid) : p.chosen })) });
  }
  if (/\/selection$/.test(url)) {
    selectionBody = JSON.parse(route.request().postData() || "{}");
    saved = selectionBody.selected;
    return json({ ok: true });
  }
  if (/\/albums$/.test(url)) {
    return json({ albums: [{ id: "demo", name: "Demo", token: "t", limit: 25,
      available: 6, rendered: 2, sets: 1, last_error: "", last_refresh: 0 }], refresh: {} });
  }
  if (/\/images(\?|$)/.test(url)) return json({ images: [], base_url: "", device: { have: [] }, device_reports: false });
  // The device dropdown, which every panel-scoped call is now about: without a
  // panel the editor loads no layout at all.
  if (/\/panels\b/.test(url)) {
    return json({
      panels: [{ id: "inkplate-a864a0", name: "Hallway", model: "inkplate5v2", online: true, width: 1280, height: 720, has_manifest: true }],
      default: "inkplate-a864a0",
    });
  }
  if (/\/status(\?|$)/.test(url)) return json({ page_locked: false, current_page: "p" });
  if (/\/layout(\?|$)/.test(url)) return json({ version: 1, pages: [{ id: "p", name: "P", widgets: [] }] });
  return json({});
});

await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });

// Onto the Images screen, then open the album.
await page.getByRole("button", { name: /images/i }).first().click();
await page.waitForTimeout(400);
await page.locator(".image-row", { hasText: "Demo" }).first().click();
await page.waitForSelector(".album-grid .album-tile", { timeout: 5000 });

const tiles = page.locator(".album-tile");
check(await tiles.count() === 6, "every photograph in the album is offered, not just the rendered ones");
check(await page.locator(".album-tile.chosen").count() === 2, "and the ones being shown open already ticked");

// The tick.
await tiles.nth(3).click();
check(await page.locator(".album-tile.chosen").count() === 3, "tapping a tile chooses it");
await tiles.nth(3).click();
check(await page.locator(".album-tile.chosen").count() === 2, "and tapping it again lets it go");

// Save is only offered once the grid differs from what the backend has.
const save = page.getByRole("button", { name: /^Show these/i });
check(await save.isDisabled(), "Save is not offered while nothing has changed");
await tiles.nth(4).click();
check(!(await save.isDisabled()), "and is offered once it has");

// All / None.
await page.getByRole("button", { name: /^All$/ }).click();
check(await page.locator(".album-tile.chosen").count() === 6, "All chooses every photograph");
await page.getByRole("button", { name: /^None$/ }).click();
check(await page.locator(".album-tile.chosen").count() === 0, "None clears them");

// An empty selection must not reach the backend: a widget with nothing to draw
// says ALBUM IS EMPTY on the panel.
await save.click();
await page.waitForTimeout(300);
check(selectionBody === null, "saving nothing is refused before it is sent");
check(
  (await page.locator(".note.danger", { hasText: /album/i }).last().innerText())
    .toUpperCase().includes("AT LEAST ONE"),
  "and says why"
);

// A real save.
await tiles.nth(0).click();
await tiles.nth(5).click();
await save.click();
await page.waitForTimeout(600);
check(
  selectionBody && JSON.stringify(selectionBody.selected.sort()) === JSON.stringify(["g0", "g5"]),
  "saving sends exactly the ticked photographs"
);

console.log(`\n${passes + failures} checks, ${failures ? "SOME FAILED" : "all picker checks passed"}`);
await browser.close();
process.exit(failures ? 1 : 0);
