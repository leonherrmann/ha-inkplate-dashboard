// WebKit pass over the Device screen, which is where every per-panel setting
// is changed. Safari-only faults have bitten this repo more than once, and the
// add-on is always inside an iframe on iOS, so a Chromium run proves nothing.
//
//   cd ha-inkplate-dashboard/dashboard/frontend && npx serve dist -l 8127
//   node ../../test-harnesses/devicecheck.mjs
//
// The settings are named sections -- Display, Power, Timers, Panel actions,
// Diagnostics, This editor. On a phone they are a list of rows, each opening on
// its own screen; on a desktop the list sits beside the open section, and the
// two start level with each other.
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

// A layout with every setting away from its default, so a row showing the
// default would be a row that is not reading the layout at all.
const LAYOUT = {
  version: 3,
  orientation: 180,
  sleep: { enabled: true, start: "23:00", end: "06:00", wake_minutes: 30 },
  refresh: { ghost_percent: 25 },
  battery: { low_percent: 10, low_screen: true },
  timer_tick_ms: 2500,
  pomodoro_auto_start: false,
  pages: [{ id: "p1", name: "Main", chip_row: "bottom", queued: true, widgets: [] }],
};

const renamed = [];
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: PHONE, hasTouch: true, isMobile: true });

await page.route("**/api/**", async (route) => {
  const url = route.request().url();
  const json = (body) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  if (/\/panels\//.test(url) && route.request().method() !== "GET") {
    renamed.push({ url, method: route.request().method(), body: route.request().postData() });
    return json({ ok: true });
  }
  if (/\/panels\b/.test(url)) {
    return json({
      panels: [
        { id: "p1", name: "Hallway", model: "inkplate5v2", online: true, width: 1280, height: 720, has_manifest: true },
        { id: "p2", name: "", model: "inkplate5v1", online: false, width: 960, height: 540, has_manifest: true },
      ],
      default: "p1",
    });
  }
  if (/\/status(\?|$)/.test(url)) {
    return json({
      online: true,
      manifest,
      current_page: "p1",
      last_seen: Date.now() / 1000,
      server_time: Date.now() / 1000,
      stats: { battery: 84, voltage: 3.9, firmware: { running: "v2026.9.44" } },
    });
  }
  if (/\/layout(\?|$)/.test(url)) return json(LAYOUT);
  if (/\/firmware(\?|$)/.test(url)) {
    return json({ held: { version: "v2026.9.44" }, device: { running: "v2026.9.44" }, servable: true, model_matches: true });
  }
  if (/\/history(\?|$)/.test(url)) return json({ samples: [] });
  if (/\/entities|\/devices|\/areas/.test(url)) return json([]);
  if (/\/images(\?|$)/.test(url)) return json({ images: [], base_url: "", device: {} });
  if (/\/albums(\?|$)/.test(url)) return json({ albums: [], refresh: {} });
  return json({});
});

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.locator(".tabbar").getByRole("button", { name: "Settings" }).click();
await page.waitForSelector(".section-row", { timeout: 8000 });

// ---------- the list ----------

const rowText = async (label) =>
  (await page.locator(".section-row", { hasText: label }).innerText()).replace(/\n/g, " ");
const screenTitle = () => page.locator("h2.screen-title").innerText();
const back = () => page.locator(".back-row").click();

check((await page.locator(".section-row").count()) === 7, "the settings are seven sections");
check(/Upside down/.test(await rowText("Display")), "each row says what it is set to");
check(/Rarely/.test(await rowText("Display")), "reading the layout, not the default");
check(/23:00/.test(await rowText("Power")), "a sleep window is the hours it covers");
check(/warns at 10%/.test(await rowText("Power")), "and the battery warning is on the same row");
check(/no auto-start/.test(await rowText("Timers")), "the timers row mentions auto-start when it is off");

// It has to fit, measured rather than eyeballed so it cannot creep back
{
  const height = await page
    .locator(".screen-layout")
    .evaluate((el) => Math.round(el.getBoundingClientRect().height));
  check(height < 700, `and the list is ${height}px rather than a scroll of cards`);
}

check(
  await page.evaluate(() => {
    const bar = document.querySelector(".tabbar");
    const rows = document.querySelectorAll(".section-row");
    const last = rows[rows.length - 1];
    return !bar || !last || last.getBoundingClientRect().bottom < bar.getBoundingClientRect().top;
  }),
  "the last row is above the tab bar rather than under it"
);

// ---------- one section at a time ----------

await page.locator(".section-row", { hasText: "Display" }).click();
await page.waitForTimeout(400);
check((await screenTitle()) === "Display", "a row opens that section");
check((await page.locator(".section-row").count()) === 0, "with the list out of the way");

const ghosting = (name) =>
  page.getByRole("group", { name: "Clear ghosting" }).getByRole("button", { name, exact: true });
await ghosting("Often").click();
await page.waitForTimeout(300);
check((await ghosting("Often").getAttribute("aria-pressed")) === "true", "the control on it is live");

await back();
await page.waitForTimeout(400);
check((await page.locator(".section-row").count()) === 7, "back returns the list");
check(/Often/.test(await rowText("Display")), "showing what was just chosen");

// The ⓘ: the explanation that used to be a paragraph is one tap away
await page.locator(".section-row", { hasText: "Display" }).click();
await page.getByRole("button", { name: "About clear ghosting" }).click();
await page.waitForTimeout(200);
check(await page.getByRole("tooltip").isVisible(), "an ⓘ opens its explanation");
check(/black flash/.test(await page.getByRole("tooltip").innerText()), "which says the why");
await page.mouse.click(5, 300);
await page.waitForTimeout(200);
check((await page.getByRole("tooltip").count()) === 0, "and a tap elsewhere closes it");
await back();

// The battery warning: a level and whether it takes the whole panel
await page.locator(".section-row", { hasText: "Power" }).click();
await page.waitForTimeout(400);
check((await screenTitle()) === "Power", "Power opens its own screen");
const warn = (name) => page.getByRole("group", { name: "Warn below" }).getByRole("button", { name, exact: true });
await warn("20 %").click();
await page.waitForTimeout(300);
check((await warn("20 %").getAttribute("aria-pressed")) === "true", "a level can be picked");
const reminder = page.getByRole("checkbox", { name: "Full-screen reminder" });
await page.locator(".setting", { hasText: "Full-screen reminder" }).locator(".switch").click();
await page.waitForTimeout(300);
check(!(await reminder.isChecked()), "and the full-screen reminder turned off");
await warn("Off").click();
await page.waitForTimeout(300);
check(
  (await page.locator(".setting", { hasText: "Full-screen reminder" }).count()) === 0,
  "with the warning off there is no reminder to set"
);
await warn("20 %").click();
await page.waitForTimeout(200);
await back();
await page.waitForTimeout(400);
check(/warns at 20%/.test(await rowText("Power")), "and the row shows the new level");

// Actions are sent the moment they are pressed, each a named button
await page.locator(".section-row", { hasText: "Panel actions" }).click();
await page.waitForTimeout(400);
for (const name of ["Refresh", "Show", "Start setup…"]) {
  check((await page.getByRole("button", { name, exact: true }).count()) === 1, `Panel actions has ${name}`);
}
await back();
await page.waitForTimeout(300);

// Settings is the last tab, where a settings tab is expected
{
  const tabs = await page.locator(".tabbar .tabbar-item").allInnerTexts();
  check(tabs[tabs.length - 1].trim() === "Settings", `Settings is the rightmost tab (${tabs.map((t) => t.trim()).join(", ")})`);
}

// Naming and forgetting a panel live here now, not in the switcher
await page.locator(".section-row", { hasText: "Panels" }).click();
await page.waitForTimeout(400);
check((await screenTitle()) === "Panels", "Panels opens its own screen");
check((await page.locator(".panel-name-field").count()) === 2, "with a name field for every panel");
{
  const field = page.getByRole("textbox", { name: "Name for Hallway" });
  await field.fill("Hall");
  await field.press("Enter");
  await page.waitForTimeout(300);
  check(renamed.some((one) => one.url.includes("/panels/p1") && /Hall/.test(one.body || "")), "a new name is saved when Enter is pressed");
}
check((await page.getByRole("button", { name: "Forget" }).count()) === 1, "Forget is offered only for the panel that is offline");
await back();
await page.waitForTimeout(300);

// ---------- a desktop: the list beside the section ----------

await page.setViewportSize(DESKTOP);
await page.waitForTimeout(500);
check((await page.locator(".section-row").count()) === 7, "a wide window keeps the list");
check((await page.locator(".section-row.active").count()) === 1, "with one section open beside it");
await page.locator(".section-row", { hasText: "Power" }).click();
await page.waitForTimeout(300);
check((await page.locator(".setting", { hasText: "Night sleep" }).count()) === 1, "choosing a row opens it");

// Asked for by name: the columns start level. A heading over one of them set
// the detail 60px below the list.
for (const section of ["Display", "Power", "Diagnostics", "This editor"]) {
  await page.locator(".section-row", { hasText: section }).click();
  await page.waitForTimeout(250);
  const [list, detail] = await Promise.all([
    page.locator(".section-list").boundingBox(),
    page.locator(".settings-detail > *").first().boundingBox(),
  ]);
  check(Math.abs(list.y - detail.y) < 2, `${section}: the section starts level with the list (${Math.round(detail.y - list.y)}px)`);
}
await page.screenshot({ path: "/tmp/device-desktop.png" });

console.log(`\n${passes + failures} checks, ${failures ? `${failures} FAILED` : "all device screen checks passed"}`);
await browser.close();
process.exit(failures ? 1 : 0);
