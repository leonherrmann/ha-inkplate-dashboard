// WebKit pass over editing a widget. Editor bugs in this repo have been
// Safari-only more than once, and the add-on is always inside an iframe on iOS,
// so a Chromium run proves nothing.
//
//   cd ha-inkplate-dashboard/dashboard/frontend && npx serve dist -l 8127
//   node ../../test-harnesses/editcheck.mjs
//
// On a phone, tapping a widget opens an edit screen: the canvas pinned at the
// top, the options under it in the page's own scroll, and no bars. It replaced
// a bottom sheet at three heights, whose options scrolled in a box a few
// hundred pixels tall and were cut off by its own buttons. On a desktop the
// options are a column, and the widget's own actions float beside it.
//
// The manifest is the firmware's own, dumped with `./sim/preview --manifest`
// and saved next to this file: the editor is built from it, so a hand-written
// one would be testing a widget set that does not exist.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { webkit } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8127";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

let passes = 0;
let failures = 0;
const check = (ok, what) => {
  if (ok) {
    passes++;
    console.log("ok   " + what);
  } else {
    failures++;
    console.log("FAIL " + what);
  }
};

const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));

const LAYOUT = {
  version: 1,
  rotation: 0,
  pages: [
    {
      id: "p1",
      name: "Home",
      chip_row: "bottom",
      queued: true,
      widgets: [
        { id: "w1", type: "room", size: "2x3", x: 0, y: 0, options: { name: "Living room", area: "a1" } },
        { id: "w2", type: "clock", size: "2x1", x: 535, y: 433, options: {} },
      ],
    },
    { id: "p2", name: "Kitchen", chip_row: "bottom", queued: true, widgets: [] },
  ],
};

const AREAS = [
  {
    id: "a1",
    name: "Living room",
    entities: [
      { entity_id: "sensor.multi_temp", name: "Multisensor temperature", domain: "sensor", device_class: "temperature" },
      { entity_id: "sensor.multi_hum", name: "Multisensor humidity", domain: "sensor", device_class: "humidity" },
      { entity_id: "light.lamp", name: "Lamp", domain: "light", device_class: "" },
    ],
  },
];

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: PHONE, hasTouch: true, isMobile: true });
let saved = LAYOUT;

const answer = async (route) => {
  const url = route.request().url();
  const json = (body) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  if (/\/panels\b/.test(url)) {
    return json({
      panels: [
        { id: "inkplate-a864a0", name: "Hallway", model: "inkplate5v2", online: true, width: 1280, height: 720, has_manifest: true },
        { id: "inkplate-057090", name: "Kitchen", model: "inkplate5v1", online: false, width: 960, height: 540, has_manifest: true },
      ],
      default: "inkplate-a864a0",
    });
  }
  if (/\/status(\?|$)/.test(url)) {
    return json({
      online: true,
      manifest,
      current_page: "p1",
      page_locked: false,
      last_seen: Date.now() / 1000,
      settings: {},
    });
  }
  if (/\/layout(\?|$)/.test(url)) {
    if (route.request().method() === "PUT" || route.request().method() === "POST") {
      saved = JSON.parse(route.request().postData() || "{}");
      return json({ ok: true });
    }
    return json(saved);
  }
  if (/\/areas(\?|$)/.test(url)) return json(AREAS);
  if (/\/entities(\?|$)/.test(url)) return json(AREAS[0].entities);
  if (/\/devices(\?|$)/.test(url)) return json([]);
  if (/\/images(\?|$)/.test(url)) return json({ images: [], base_url: "", device: { have: [] } });
  if (/\/albums(\?|$)/.test(url)) return json({ albums: [], refresh: {} });
  if (/\/history(\?|$)/.test(url)) return json({ history: [] });
  return json({});
};
await page.route("**/api/**", answer);

await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
await page.waitForSelector(".panel .widget", { timeout: 5000 });

const box = async (locator) => locator.boundingBox();

// Four shipped bugs in this stylesheet were something wider than its window,
// and all four were invisible in a static render.
const spill = () =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    let worst = null;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const over = Math.round(r.right - width);
      if (over > 1 && (!worst || over > worst.over)) worst = { over, what: el.className || el.tagName };
    }
    return worst;
  });
const noSpill = async (where) => {
  const worst = await spill();
  check(!worst, `nothing spills past the window ${where}${worst ? ` (${worst.what} by ${worst.over}px)` : ""}`);
};

// ---------- the phone editor: one screen ----------

console.log("--- the editor on a phone ---");
check((await page.locator(".edit-fields").count()) === 0, "nothing selected means no edit screen");
check((await page.locator(".tabbar").count()) === 1 && (await page.locator(".topbar").count()) === 1,
  "the top bar and the tab bar are both there");
check((await page.locator(".page-tabs .page-chip").count()) === 2, "the pages are tabs over the canvas");
{
  const extra = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  check(extra <= 1, `the editor fits one screen without scrolling (${extra}px over)`);
  const bar = await box(page.locator(".pagebar"));
  check(bar.height < 60, `the toolbar is one slim row (${Math.round(bar.height)}px)`);
  const controls = await page.locator(".pagebar button").count();
  check(controls <= 5, `with ${controls} controls on it`);
}
await noSpill("in the editor");

// ---------- the edit screen ----------

console.log("--- editing a widget on a phone ---");
await page.locator(".panel .widget").first().click();
await page.waitForSelector(".edit-fields", { timeout: 3000 });
await page.waitForTimeout(300);
check((await page.locator(".edit-head h2").innerText()) === "Living room", "tapping a widget opens its edit screen, named");
check((await page.locator(".tabbar").count()) === 0, "the tab bar gives its room to the options");
check((await page.locator(".topbar").count()) === 0, "and so does the top bar");
check(await page.locator(".panel .widget.selected").isVisible(), "the widget being edited is on screen");

// Every field label styled, not only the ones whose rule happened to be global
{
  const unstyled = await page.$$eval(".edit-fields label > span, .edit-fields .field-block > span", (spans) =>
    spans
      .filter((span) => Math.round(parseFloat(getComputedStyle(span).fontSize)) !== 11)
      .map((span) => span.textContent)
  );
  check(unstyled.length === 0, `every field is labelled the same way${unstyled.length ? ` (${unstyled.join(", ")} are not)` : ""}`);
}

// The options scroll with the page, not in a box of their own, and the canvas
// stays pinned while they do -- which is what the sheet got wrong.
{
  const inner = await page.$$eval(".edit-fields, .edit-fields *", (els) =>
    els.filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1).length
  );
  check(inner === 0, "no option list scrolls inside a box of its own");
  await page.evaluate(() => window.scrollTo(0, 99999));
  await page.waitForTimeout(250);
  const scrolled = await page.evaluate(() => window.scrollY);
  check(scrolled > 0, `the page scrolls through the options (${scrolled}px)`);
  const main = await box(page.locator(".workspace > main"));
  check(Math.abs(main.y) < 1, "and the head and canvas stay pinned at the top");
  check(await page.locator(".panel .widget.selected").isVisible(), "so the widget stays in view while it is edited");
  const last = await box(page.locator(".edit-fields > *").last());
  check(last.y + last.height <= PHONE.height + 1, "and the last option can be reached, not cut off");
  check(last.y >= main.y + main.height - 1, "clear of the pinned canvas");
}
await noSpill("on the edit screen");

// The advanced options are there, and out of the way
{
  const advanced = page.locator(".edit-fields details.advanced");
  check((await advanced.count()) === 1, "the update limit is under Advanced");
  check(!(await advanced.evaluate((el) => el.open)), "which starts closed");
}

// ---------- actions behind the ⋯ ----------

await page.evaluate(() => window.scrollTo(0, 0));
await page.getByRole("button", { name: "Widget actions" }).click();
await page.waitForTimeout(200);
for (const name of ["Bring to front", "Send to back", "Duplicate", "Delete"]) {
  check((await page.locator(".menu-item", { hasText: name }).count()) === 1, `the ⋯ offers ${name}`);
}
const before = await page.locator(".panel .widget").count();
await page.locator(".menu-item", { hasText: "Duplicate" }).click();
await page.waitForTimeout(400);
check((await page.locator(".panel .widget").count()) === before + 1, "Duplicate adds a copy");
check((await page.locator(".edit-head h2").innerText()) === "Living room", "and the edit screen follows it");
await page.getByRole("button", { name: "Widget actions" }).click();
await page.locator(".menu-item", { hasText: "Delete" }).click();
await page.waitForTimeout(400);
check((await page.locator(".panel .widget").count()) === before, "Delete takes it away again");
check((await page.locator(".edit-fields").count()) === 0, "and closes the edit screen with it");
check((await page.locator(".tabbar").count()) === 1, "bringing the tab bar back");

// ---------- a big option is a row, and opens a screen ----------

await page.locator(".panel .widget").first().click();
await page.waitForSelector(".edit-fields", { timeout: 3000 });
{
  const rows = page.locator(".option-row");
  const count = await rows.count();
  check(count > 0, `big options are rows rather than controls (${count} of them)`);
  const label = (await rows.first().locator(".option-row-label").innerText()).trim();
  await rows.first().click();
  await page.waitForTimeout(300);
  check((await page.locator(".edit-screen-title").innerText()).trim() === label, `a row opens its own screen (${label})`);
  check((await page.locator(".option-row").count()) === 0, "with the rest of the list out of the way");
  check(await page.locator(".panel .widget.selected").isVisible(), "and the canvas still above it");
  await noSpill("on an option's screen");
  await page.locator(".back-row").click();
  await page.waitForTimeout(300);
  check((await page.locator(".option-row").count()) === count, "back returns the whole list");
}

// ---------- a picker lands on top, and Escape closes only it ----------

{
  await page.locator(".entity-trigger").first().click();
  await page.waitForSelector(".picker", { timeout: 3000 });
  check(await page.locator(".picker").isVisible(), "a picker opened from the edit screen is on top of it");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check((await page.locator(".picker").count()) === 0, "Escape closes the picker");
  check((await page.locator(".edit-fields").count()) === 1, "without leaving the edit screen under it");
}

await page.getByRole("button", { name: "Done", exact: true }).click();
await page.waitForTimeout(300);
check((await page.locator(".edit-fields").count()) === 0, "Done closes the edit screen");
check((await page.locator(".panel .widget.selected").count()) === 0, "and lets go of the widget");

// ---------- a desktop: the column, and the bar by the widget ----------

console.log("--- editing on a desktop ---");
for (const width of [1280, 1440, 1920]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(350);
  const bar = await box(page.locator(".pagebar"));
  check(bar.height < 60, `${width}: the toolbar is one row (${Math.round(bar.height)}px)`);
}
await page.setViewportSize(DESKTOP);
await page.waitForTimeout(350);
check((await page.locator(".edit-fields").count()) === 0, "a wide window has no edit screen");
await page.locator(".panel .widget").first().click();
await page.waitForTimeout(350);
check((await page.locator("aside.inspector.open").count()) === 1, "the options are the inspector column");
check((await page.locator(".tabbar:visible").count()) === 0, "and nothing phone-shaped is left behind");
check(
  (await page.locator("aside.inspector .hint").filter({ hasText: /^\d+, \d+/ }).count()) === 0,
  "without the coordinates line"
);
{
  const bar = page.locator(".selection-bar");
  check((await bar.count()) === 1, "the selected widget has its actions beside it");
  check((await bar.locator("button").count()) === 4, "front, back, duplicate and delete");
  const b = await box(bar);
  const w = await box(page.locator(".panel .widget.selected"));
  check(b.y + b.height <= w.y + 1 || b.y >= w.y + w.height - 1, "above or below the widget, not over it");
  check(b.x >= 0 && b.x + b.width <= DESKTOP.width, "and inside the window");
  await page.locator(".panel .widget").nth(1).click();
  await page.waitForTimeout(300);
  const moved = await box(bar);
  check(Math.abs(moved.y - b.y) > 20 || Math.abs(moved.x - b.x) > 20, "it follows the selection to another widget");
}
// The panel chooser drops from its own button, rather than opening in the
// middle of the window -- it is in the top-left corner, and a dialog in the
// centre made every choice a trip across the screen.
{
  const trigger = page.locator(".topbar-panel");
  await trigger.click();
  await page.waitForTimeout(250);
  const t = await box(trigger);
  const m = await box(page.locator(".panel-menu"));
  check(Math.abs(m.x - t.x) < 2 && m.y >= t.y + t.height && m.y - (t.y + t.height) < 12,
    `the panel list opens right under its button (${Math.round(m.x)},${Math.round(m.y)})`);
  check((await page.locator(".picker-backdrop").count()) === 0, "as a menu, not a dialog over the page");
  check((await page.locator(".panel-menu .panel-choose").count()) === 2, "listing both panels");
  check((await page.locator(".panel-menu").getByText(/Rename|Forget/).count()) === 0,
    "and only choosing: naming and forgetting are in Settings");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  check((await page.locator(".panel-menu").count()) === 0, "and Escape puts it away");
}

// The columns start level with each other
{
  const [pages, tools, options] = await Promise.all([
    box(page.locator(".page-list-card")),
    box(page.locator(".pagebar")),
    box(page.locator("aside.inspector")),
  ]);
  check(Math.abs(pages.y - tools.y) < 2 && Math.abs(tools.y - options.y) < 2,
    `the pages, the toolbar and the options start level (${Math.round(pages.y)}, ${Math.round(tools.y)}, ${Math.round(options.y)})`);
}
await noSpill("on a desktop");

// ---------- inside Home Assistant's frame ----------

// The tab bar's clearance under its labels is measured from the page above:
// how much of the home-indicator area the frame overlaps. Headless WebKit has
// no inset, so what can be checked is the geometry -- a frame that stops short
// of the bottom leaves the bar alone, and one that runs past it lifts the bar
// by the overrun.
for (const [what, height, want] of [
  // The floating bar stands on max(12px, clearance - 6px): its own margin
  // when nothing needs clearing, higher only when the frame overruns.
  ["a frame that stops 34px short of the bottom", "calc(100% - 34px)", "12px"],
  ["a frame that runs 20px past the bottom", "calc(100% + 20px)", "14px"],
]) {
  console.log(`--- ${what} ---`);
  const outer = await browser.newPage({ viewport: PHONE, hasTouch: true, isMobile: true });
  await outer.route("**/api/**", answer);
  await outer.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await outer.evaluate(([src, h]) => {
    document.body.innerHTML = `<iframe src="${src}" style="position:fixed;left:0;top:0;width:100%;height:${h};border:0"></iframe>`;
  }, [`${BASE}/index.html`, height]);
  const frame = await (await outer.waitForSelector("iframe")).contentFrame();
  await frame.waitForSelector(".tabbar", { timeout: 8000 }).catch(() => {});
  await frame.waitForTimeout(500);
  check(await frame.evaluate(() => document.documentElement.hasAttribute("data-framed")), "the editor knows it is framed");
  const lift = await frame.evaluate(() => getComputedStyle(document.querySelector(".tabbar")).bottom).catch(() => "none");
  check(lift === want, `the floating tab bar stands ${want} off the frame's foot (${lift})`);
  await outer.close();
}

// What the iPhone app measured on 2026-09-26: the frame runs to the foot of
// Home Assistant's page, but the page stops above the home indicator and the
// app paints the strip under it in Home Assistant's own background. The bar
// must not be lifted, and in the matching theme takes the strip's colour so
// the two read as one surface.
{
  console.log("--- a page that stops above the home indicator (the iPhone app) ---");
  const context = await browser.newContext({
    viewport: PHONE,
    screen: { width: PHONE.width, height: PHONE.height + 80 },
    colorScheme: "dark",
    hasTouch: true,
    isMobile: true,
  });
  const outer = await context.newPage();
  await outer.route("**/api/**", answer);
  await outer.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await outer.evaluate((src) => {
    document.documentElement.style.setProperty("--primary-background-color", "#111111");
    document.body.innerHTML = `<iframe src="${src}" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>`;
  }, `${BASE}/index.html`);
  const frame = await (await outer.waitForSelector("iframe")).contentFrame();
  await frame.waitForSelector(".tabbar", { timeout: 8000 }).catch(() => {});
  await frame.waitForTimeout(500);
  const bar = await frame.evaluate(() => {
    const style = getComputedStyle(document.querySelector(".tabbar"));
    return { lift: style.bottom, colour: style.backgroundColor };
  });
  check(bar.lift === "12px", `the bar is not lifted past its own margin (${bar.lift})`);
  check(bar.colour !== "rgb(17, 17, 17)", `with no inset there is no strip, so the bar keeps its own colour (${bar.colour})`);
  await context.close();
}

// Home Assistant 2026.8 on an iPhone, as probeHost() found it: the frame
// element itself carries padding-bottom equal to the inset, from a stylesheet
// inside a shadow root, so its inside stops short and the padding shows as a
// strip under the tab bar. The editor cancels that one padding.
{
  console.log("--- a frame padded by the page above (Home Assistant 2026.8) ---");
  const outer = await browser.newPage({ viewport: PHONE, hasTouch: true, isMobile: true });
  await outer.route("**/api/**", answer);
  await outer.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await outer.evaluate((src) => {
    document.body.innerHTML = "";
    const host = document.createElement("ha-panel");
    host.style.cssText = "display:block;position:fixed;inset:0";
    document.body.appendChild(host);
    host.attachShadow({ mode: "open" }).innerHTML =
      `<style>iframe{display:block;box-sizing:border-box;width:100%;height:100%;border:0;padding-bottom:34px;background:#111}</style>` +
      `<iframe class="loaded" src="${src}"></iframe>`;
  }, `${BASE}/index.html`);
  await outer.waitForTimeout(2500);
  const frame = outer.frames()[1];
  await frame.waitForSelector(".tabbar", { timeout: 8000 }).catch(() => {});
  await frame.waitForTimeout(400);
  const pad = await outer.evaluate(() =>
    getComputedStyle(document.querySelector("ha-panel").shadowRoot.querySelector("iframe")).paddingBottom);
  check(pad === "0px", `the frame's padding is cancelled (${pad})`);
  const bar = await frame.evaluate(() => document.querySelector(".tabbar").getBoundingClientRect().bottom);
  check(Math.abs(bar - (PHONE.height - 12)) < 1, `so the floating tab bar stands its own margin off the screen's foot (${Math.round(bar)})`);
  await outer.close();
}

console.log(`\n${passes + failures} checks, ${failures ? `${failures} FAILED` : "all edit checks passed"}`);
await browser.close();
process.exit(failures ? 1 : 0);
