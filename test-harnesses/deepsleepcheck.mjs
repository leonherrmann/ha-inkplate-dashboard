// WebKit pass over deep sleep between updates: the setting in the Display
// section, what it saves (refresh.deep_sleep_minutes, which the firmware
// reads), the clock warning it raises there and in the editor, and a panel
// that is asleep reading as asleep rather than offline.
//
//   cd ha-inkplate-dashboard/dashboard/frontend && npx serve dist -l 8127
//   node ../../test-harnesses/deepsleepcheck.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { webkit } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));

let passes = 0;
let failures = 0;
const check = (ok, what) => {
  if (ok) { passes++; console.log("ok   " + what); } else { failures++; console.log("FAIL " + what); }
};

const browser = await webkit.launch();
for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) {
  const label = viewport.width < 600 ? "phone" : "desktop";
  const narrow = viewport.width < 600;
  let layout = {
    version: 1, rotation: 0, refresh: { ghost_percent: 12 },
    pages: [{
      id: "p1", name: "Main", chip_row: "bottom", queued: true,
      widgets: [{ id: "w1", type: "clock", size: "2x1", x: 41, y: 29, options: {} }],
    }],
  };
  let asleep = false;
  const page = await browser.newPage({ viewport, isMobile: narrow, hasTouch: narrow });
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
    if (/\/panels\b/.test(url)) {
      return json({
        panels: [{ id: "inkplate-a864a0", name: "Kitchen", model: "inkplate5v2", online: !asleep, asleep,
                   width: 1280, height: 720, has_manifest: true }],
        default: "inkplate-a864a0",
      });
    }
    if (/\/status(\?|$)/.test(url)) {
      return json({ online: !asleep, asleep, manifest, current_page: "p1",
                    last_seen: Date.now() / 1000 - 120, settings: {} });
    }
    if (/\/(areas|entities|devices|history)(\?|$)/.test(url)) return json([]);
    if (/\/images(\?|$)/.test(url)) return json({ images: [], base_url: "", device: { have: [] } });
    if (/\/albums(\?|$)/.test(url)) return json({ albums: [], refresh: {} });
    return json({});
  });

  await page.goto("http://127.0.0.1:8127/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Settings$/ }).first().click();
  await page.locator(".section-row", { hasText: "Display" }).first().click();

  const group = page.getByRole("group", { name: "Sleep between updates" });
  const choice = (name) => group.getByRole("button", { name, exact: true });
  check(await group.count() === 1, `${label}: the Display section offers sleeping between updates`);
  const labels = await group.getByRole("button").allInnerTexts();
  check(labels.join(",") === "Off,1m,2m,3m,5m,10m,15m,30m,1h",
        `${label}: with 1, 2, 3, 5, 10, 15 and 30 minutes and an hour (${labels.join(",")})`);
  check(await choice("Off").getAttribute("aria-pressed") === "true", `${label}: off until chosen`);
  check(await page.locator(".deep-sleep-note").count() === 0, `${label}: and no clock warning while off`);

  await choice("5m").click();
  await page.waitForTimeout(400);
  check(layout.refresh?.deep_sleep_minutes === 5,
        `${label}: 5m saves refresh.deep_sleep_minutes = 5 (${layout.refresh?.deep_sleep_minutes})`);
  check(layout.refresh?.ghost_percent === 12, `${label}: and leaves the ghosting setting alone`);
  const note = page.locator(".deep-sleep-note");
  check(await note.count() === 1 && /up to 5 minutes behind/.test(await note.innerText()),
        `${label}: the settings warn that the clock is up to 5 minutes behind`);
  check(await note.evaluate((el) => el.classList.contains("warn")),
        `${label}: as a warning, since this layout has a clock`);
  check(/Not used while the panel sleeps/.test(
          await page.locator(".setting", { hasText: "Redraw changed readings" }).innerText()),
        `${label}: the update limit says it is not used meanwhile`);

  await choice("1h").click();
  await page.waitForTimeout(400);
  check(layout.refresh?.deep_sleep_minutes === 60 && /up to an hour behind/.test(await note.innerText()),
        `${label}: an hour is 60, and the warning says an hour`);

  const wide = await page.evaluate(() =>
    [...document.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).length);
  check(wide === 0, `${label}: nothing is wider than the window (${wide})`);
  await page.screenshot({ path: `/tmp/deepsleep-settings-${label}.png`, fullPage: !narrow });

  // The editor: a clock selected on a panel that sleeps between updates
  await page.goto("http://127.0.0.1:8127/", { waitUntil: "networkidle" });
  await page.locator(".panel .widget").first().click();
  await page.waitForTimeout(300);
  const warning = page.locator(".inspector-note");
  check(await warning.count() === 1 && /up to an hour behind/.test(await warning.innerText()),
        `${label}: the clock's options in the editor carry the same warning`);
  await page.screenshot({ path: `/tmp/deepsleep-editor-${label}.png` });

  // Asleep, as the add-on reports it
  asleep = true;
  await page.goto("http://127.0.0.1:8127/", { waitUntil: "networkidle" });
  if (!narrow) {
    check(/Asleep/.test(await page.locator(".topbar-seen").innerText()),
          `${label}: the top bar says asleep, not offline`);
    check(await page.locator(".topbar .dot.asleep").count() === 1, `${label}: with its own dot`);
  }
  await page.close();
}

await browser.close();
console.log(`\n${passes + failures} checks, ${failures === 0 ? "all deep sleep checks passed" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
