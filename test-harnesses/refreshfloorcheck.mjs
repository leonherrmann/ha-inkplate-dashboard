// WebKit pass over the Device screen's refresh card: that the limit on how often
// a changed reading may repaint the panel can be chosen, and is saved as the
// refresh.min_interval the firmware reads.
//
//   cd ha-inkplate-dashboard/dashboard/frontend && npx serve dist -l 8127
//   node ../../test-harnesses/refreshfloorcheck.mjs
import { webkit } from "playwright";

let passes = 0;
let failures = 0;
const check = (ok, what) => {
  if (ok) { passes++; console.log("ok   " + what); } else { failures++; console.log("FAIL " + what); }
};

const browser = await webkit.launch();
for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) {
  const label = viewport.width < 600 ? "phone" : "desktop";
  let layout = {
    version: 1, rotation: 0, refresh: { ghost_percent: 12 },
    pages: [{ id: "p1", name: "Main", chip_row: "bottom", queued: true, widgets: [] }],
  };
  const page = await browser.newPage({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  page.on("pageerror", (error) => console.log("PAGEERROR: " + error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (/\/layout(\?|$)/.test(url) && request.method() !== "GET") {
      layout = JSON.parse(request.postData() || "{}");
      return json({ ok: true });
    }
    if (/\/layout(\?|$)/.test(url)) return json(layout);
    if (/\/panels\b/.test(url)) return json({ panels: [{ id: "inkplate-a864a0", name: "Kitchen", model: "inkplate5v2", online: true, width: 1280, height: 720, has_manifest: true }], default: "inkplate-a864a0" });
    if (/\/status(\?|$)/.test(url)) return json({ online: true, current_page: "p1", last_seen: Date.now() / 1000, settings: {} });
    if (/\/(areas|entities|devices|history)(\?|$)/.test(url)) return json([]);
    if (/\/images(\?|$)/.test(url)) return json({ images: [], base_url: "", device: { have: [] } });
    if (/\/albums(\?|$)/.test(url)) return json({ albums: [], refresh: {} });
    return json({});
  });
  await page.goto("http://127.0.0.1:8127/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Device$/ }).first().click();
  // The Display section, where the refresh settings are. Open by default on a
  // desktop and a row to tap on a phone; clicking it is harmless either way.
  await page.locator(".section-row", { hasText: "Display" }).first().click();
  const floor = (name) =>
    page.getByRole("group", { name: "Redraw changed readings" }).getByRole("button", { name, exact: true });

  const current = floor("30 s");
  check(await current.getAttribute("aria-pressed") === "true",
        `${label}: with nothing set, the firmware's default of 30 seconds is shown as chosen`);
  await floor("5 min").click();
  await page.waitForTimeout(400);
  check(layout.refresh?.min_interval === "5m", `${label}: choosing 5 minutes saves refresh.min_interval = 5m (${layout.refresh?.min_interval})`);
  check(layout.refresh?.ghost_percent === 12, `${label}: and leaves the ghosting setting alone`);
  check(await floor("5 min").getAttribute("aria-pressed") === "true",
        `${label}: and shows it as chosen`);
  await floor("Instantly").click();
  await page.waitForTimeout(400);
  check(layout.refresh?.min_interval === "off", `${label}: instantly is "off", which the firmware reads as no limit`);
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).length);
  check(wide === 0, `${label}: nothing is wider than the window (${wide})`);
  await page.close();
}
await browser.close();
console.log(`\n${passes + failures} checks, ${failures === 0 ? "all refresh floor checks passed" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
