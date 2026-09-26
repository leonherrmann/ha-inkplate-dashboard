// WebKit pass over the Device screen, which is where every per-panel setting
// is changed. Safari-only faults have bitten this repo more than once, and the
// add-on is always inside an iframe on iOS, so a Chromium run proves nothing.
//
//   cd ha-inkplate-dashboard/dashboard/frontend && npx serve dist -l 8127
//   node ../../test-harnesses/devicecheck.mjs
//
// The subject is the phone layout: four settings expanded down a 390px screen
// was most of it spent on controls that are set once and read at a glance after
// that. They are a list of rows now, each opening on its own -- and the desktop
// keeps the cards side by side, which is what its width is for.
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

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: PHONE, hasTouch: true, isMobile: true });

await page.route("**/api/**", async (route) => {
  const url = route.request().url();
  const json = (body) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  if (/\/panels\b/.test(url)) {
    return json({
      panels: [{ id: "p1", name: "Hallway", model: "inkplate5v2", online: true, width: 1280, height: 720, has_manifest: true }],
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
await page.getByRole("button", { name: /^Device$/ }).first().click();
await page.waitForSelector(".setting-row", { timeout: 8000 });

// ---------- the list ----------

const rowText = async (label) =>
  (await page.locator(".setting-row", { hasText: label }).innerText()).replace(/\n/g, " ");

check((await page.locator(".setting-row").count()) >= 5, "the settings are a list of rows");
check(/Upside down/.test(await rowText("Orientation")), "each row says what it is set to");
check(/25\s*%/.test(await rowText("Screen refresh")), "reading the layout, not the default");
check(/23:00/.test(await rowText("Night sleep")), "a sleep window is the hours it covers");
check(/auto-start off/.test(await rowText("Timers")), "and the timers row mentions auto-start when it is off");

// The whole point: it has to fit. Four cards expanded came to well over a
// screen; the block is measured rather than eyeballed so it cannot creep back.
{
  const height = await page
    .locator(".device-screen")
    .evaluate((el) => Math.round(el.getBoundingClientRect().height));
  check(height < 900, `and the screen is ${height}px rather than a scroll of cards`);
}

check(
  await page.evaluate(() => {
    const bar = document.querySelector(".tabbar");
    const last = document.querySelector(".setting-row:last-of-type");
    return !bar || !last || last.getBoundingClientRect().bottom < bar.getBoundingClientRect().top;
  }),
  "the last row is above the tab bar rather than under it"
);

// ---------- one setting at a time ----------

await page.locator(".setting-row", { hasText: "Screen refresh" }).click();
await page.waitForTimeout(400);
check((await page.locator(".screen-head h2").innerText()) === "Screen refresh", "a row opens that setting");
check((await page.locator(".setting-row").count()) === 0, "with the rest of the list out of the way");
check((await page.locator(".settings-grid .card").count()) === 1, "and the setting's own card on it");

// The control still works from in here -- it is the same card, not a copy. The
// levels are buttons with aria-pressed rather than radios, which is what the
// rest of the editor uses for a one-of-several choice.
await page.locator(".settings-grid .card .choice").first().click();
await page.waitForTimeout(300);
check(
  (await page.locator(".settings-grid .card .choice").first().getAttribute("aria-pressed")) === "true",
  "the control on it is live"
);

await page.getByRole("button", { name: /Back to Device/ }).click();
await page.waitForTimeout(400);
check((await page.locator(".setting-row").count()) >= 5, "back returns the list");
check(/6\s*%/.test(await rowText("Screen refresh")), "showing what was just chosen");

// The battery warning: a level and whether it takes the whole panel, both read
// back from the layout and both changeable from its own screen.
check(
  /Below 10%.*full screen/.test(await rowText("Low battery")),
  "the battery row says the level and that it goes full screen"
);
await page.locator(".setting-row", { hasText: "Low battery" }).click();
await page.waitForTimeout(400);
check((await page.locator(".screen-head h2").innerText()) === "Low battery", "it opens its own card");
await page.getByRole("button", { name: "20 %" }).click();
await page.waitForTimeout(300);
check(
  (await page.getByRole("button", { name: "20 %" }).getAttribute("aria-pressed")) === "true",
  "a level can be picked"
);
await page.locator(".settings-grid .card .switch").click();
await page.waitForTimeout(300);
check(
  !(await page.locator(".settings-grid .card .switch input").isChecked()),
  "and the full-screen warning turned off"
);
await page.screenshot({ path: "/tmp/device-battery-phone.png" });
await page.getByRole("button", { name: "Off" }).click();
await page.waitForTimeout(300);
check(
  (await page.locator(".settings-grid .card .switch").count()) === 0,
  "with the warning off there is no full-screen switch to set"
);
await page.getByRole("button", { name: "20 %" }).click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: /Back to Device/ }).click();
await page.waitForTimeout(400);
check(/Below 20%/.test(await rowText("Low battery")), "and the row shows the new level");
check(!/full screen/.test(await rowText("Low battery")), "without the full screen");

// Commands are actions rather than a setting, and they are behind a row too --
// three buttons that each do something the moment they are pressed are not
// something to keep on a screen you scroll past.
await page.locator(".setting-row", { hasText: "Commands" }).click();
await page.waitForTimeout(400);
check(
  (await page.locator(".action-row").count()) >= 3,
  "the commands are on a screen of their own"
);
await page.getByRole("button", { name: /Back to Device/ }).click();
await page.waitForTimeout(300);

// ---------- and the desktop is untouched ----------

await page.setViewportSize(DESKTOP);
await page.waitForTimeout(500);
check((await page.locator(".setting-row").count()) === 0, "a wide window has no rows");
check(
  (await page.locator(".settings-grid .card").count()) === 6,
  "it has the six cards side by side, which is what the width is for"
);
await page.screenshot({ path: "/tmp/device-desktop.png" });

console.log(`\n${passes + failures} checks, ${failures ? `${failures} FAILED` : "all device screen checks passed"}`);
await browser.close();
process.exit(failures ? 1 : 0);
