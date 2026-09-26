// WebKit pass over the icon picker: the grid, its sections, and the two shells
// it appears in. Editor bugs in this repo have been Safari-only more than once
// and the add-on is always inside an iframe on iOS, so a Chromium run proves
// nothing.
//
//   cd ha-inkplate-dashboard/dashboard/frontend && npx serve dist -l 8127
//   node ../../test-harnesses/iconcheck.mjs
//
// The first section needs no browser and is the one that will fail first: it
// compares the names the *firmware's* manifest offers against the outlines
// tools/icon-glyphs.py copied out of the firmware. The two repos are released
// separately, so they drift; an icon that lists without a drawing is the
// symptom, and this says so in one line rather than leaving a blank tile to be
// noticed by eye.
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

// --- do the two repos still agree about which icons exist? -------------------

console.log("--- every icon the manifest offers has a drawing ---");

const { ICON_GLYPHS, ICON_VIEW_BOX } = await import(
  join(HERE, "../dashboard/frontend/src/iconGlyphs.js")
);

const offered = new Set();
for (const widget of manifest.widgets) {
  for (const option of widget.options || []) {
    if (option.type !== "icon") continue;
    const values = option.values_ref ? manifest.values[option.values_ref] : option.values;
    for (const name of values || []) offered.add(name);
  }
}

const undrawn = [...offered].filter((name) => !ICON_GLYPHS[name]);
check(offered.size > 0, `the manifest offers ${offered.size} icons`);
check(
  undrawn.length === 0,
  undrawn.length === 0
    ? "and every one of them has an outline in iconGlyphs.js"
    : `${undrawn.length} have no outline -- re-run tools/icon-glyphs.py (${undrawn.slice(0, 4).join(", ")}…)`
);
check(ICON_VIEW_BOX === "0 -960 960 960", `they share one viewBox (${ICON_VIEW_BOX})`);
check(
  Object.values(ICON_GLYPHS).every((path) => /^[Mm]/.test(path)),
  "and every outline is a path that starts with a move"
);

// --- the editor ---------------------------------------------------------------

const LAYOUT = {
  version: 1,
  rotation: 0,
  pages: [
    {
      id: "p1",
      name: "Home",
      chip_row: "bottom",
      widgets: [
        // An entity card, whose icon option is the long list -- 71 of them, the
        // one that needs sections.
        { id: "w1", type: "entity", size: "2x2", x: 0, y: 0, options: { name: "Lamp" } },
        // And a room card, whose list is ten, which should not get them.
        { id: "w2", type: "room", size: "2x2", x: 530, y: 0, options: { name: "Kitchen" } },
      ],
    },
  ],
};

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: PHONE, hasTouch: true, isMobile: true });

await page.route("**/api/**", async (route) => {
  const url = route.request().url();
  const json = (body) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  if (/\/panels\b/.test(url)) {
    return json({
      panels: [
        {
          id: "inkplate-a864a0",
          name: "Hallway",
          model: "inkplate5v2",
          online: true,
          width: 1280,
          height: 720,
          has_manifest: true,
        },
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
  if (/\/layout(\?|$)/.test(url)) return json(LAYOUT);
  if (/\/areas(\?|$)/.test(url)) return json([]);
  if (/\/entities(\?|$)/.test(url)) return json([]);
  if (/\/devices(\?|$)/.test(url)) return json([]);
  if (/\/images(\?|$)/.test(url)) return json({ images: [], base_url: "", device: { have: [] } });
  if (/\/albums(\?|$)/.test(url)) return json({ albums: [], refresh: {} });
  if (/\/history(\?|$)/.test(url)) return json({ history: [] });
  return json({});
});

await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
await page.waitForSelector(".panel .widget", { timeout: 5000 });

// ---------- on a phone: the option's own screen ----------

console.log("--- the grid on a phone ---");

// Tapping a widget on a phone opens its edit screen: the canvas pinned at the
// top and the options under it.
const openSheet = async (index) => {
  await page.locator(".panel .widget").nth(index).click();
  await page.waitForSelector(".edit-fields", { timeout: 3000 });
  await page.waitForTimeout(250);
};

// "Icon" on the room card, "Icon override" on the entity card -- both are the
// same option type, and which label a widget gives it is the firmware's.
const iconRow = () =>
  page.locator(".option-row", { has: page.locator(".option-row-label", { hasText: /^Icon/ }) });

await openSheet(0);
check(await iconRow().count() === 1, "the icon option is a row that opens a screen");

await iconRow().click();
await page.waitForSelector(".icon-grid", { timeout: 3000 });

const tiles = page.locator(".icon-tile");
check((await tiles.count()) === 71, `the screen shows every icon offered (${await tiles.count()})`);
check(
  (await page.locator(".icon-tile .icon-glyph").count()) === (await tiles.count()),
  "each as a drawing rather than a name"
);
check(
  (await page.locator(".icon-tile-missing").count()) === 0,
  "with none falling back to the missing-outline mark"
);

// The drawing has to be the *right* one. Checked against the module rather than
// against a recorded path, so this says "the tile labelled shower draws the
// shower outline" and not "this build draws what it drew last time".
{
  const shower = page.locator(".icon-tile", { hasText: "water drop" }).first();
  const drawn = await shower.locator("path").getAttribute("d");
  check(drawn === ICON_GLYPHS.entity_water_drop, "and the drawing on a tile is that icon's own outline");
}

const headings = page.locator(".icon-section-heading");
check((await headings.count()) > 3, `seventy icons are grouped (${await headings.count()} sections)`);
// Compared case-insensitively: the headings are upper-cased in CSS, and
// innerText reports what is rendered rather than what is written.
{
  const first = (await headings.first().innerText()).trim();
  check(first.toLowerCase() === "lighting", `the first section is the one people reach for (${first})`);
}

// Searching is the other way to find one, and it flattens the sections: three
// headings over a grid of two each is furniture.
await page.locator(".option-search input").fill("valve");
await page.waitForTimeout(150);
check((await tiles.count()) === 1, `searching narrows the grid (${await tiles.count()} left)`);
check((await headings.count()) === 0, "and drops the headings while it is narrowed");

await page.locator(".option-search input").fill("");
await page.waitForTimeout(150);
check((await tiles.count()) === 71, "clearing the search brings them all back");

// ---------- picking one ----------

console.log("--- picking one ---");

await page.locator(".icon-tile", { hasText: "lock open" }).first().click();
await page.waitForTimeout(250);

// The screen stays open, as the image and album screens do: every control here
// writes as it is changed, so there is nothing to confirm and no reason to
// throw away the list someone may still be choosing from.
check(
  (await page.locator(".icon-tile.selected").count()) === 1,
  "the tile picked is the one marked, and only it"
);
check(
  (await page.locator(".icon-tile.selected .icon-tile-label").innerText()).trim() === "lock open",
  "and it is the one that was tapped"
);

// Back to the list, which is where the choice has to show.
await page.locator(".back-row").first().click();
await page.waitForTimeout(250);

const chosen = (await iconRow().locator(".option-row-value").innerText()).trim();
check(/lock open/.test(chosen), `the row it came from now reads the icon (${chosen})`);
check(
  (await iconRow().locator(".option-row-glyph").count()) === 1,
  "and shows the drawing beside the name, so the list can be read at a glance"
);

// ---------- a short list gets no sections ----------

console.log("--- a list short enough to take in at once ---");

await page.getByRole("button", { name: "Done" }).click();
await openSheet(1);
await iconRow().click();
await page.waitForSelector(".icon-grid", { timeout: 3000 });

check((await tiles.count()) === 10, `the room card offers its ten (${await tiles.count()})`);
check((await page.locator(".icon-section-heading").count()) === 0, "and gets no headings over them");
check(
  (await page.locator(".option-search").count()) === 0,
  "nor a search box asking you to type to see what is already on screen"
);

// ---------- on a desktop: the shared picker ----------

console.log("--- the same grid on a wide screen ---");

await page.setViewportSize(DESKTOP);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".panel .widget", { timeout: 5000 });
await page.locator(".panel .widget").first().click();
await page.waitForSelector(".inspector.open", { timeout: 3000 });

const trigger = page.locator(".icon-trigger");
check(await trigger.count() === 1, "the field is a trigger, not a select of seventy names");
check(await page.locator("select.icon-select").count() === 0, "and the old select is gone");

await trigger.click();
await page.waitForSelector(".picker .icon-grid", { timeout: 3000 });
check(await page.locator(".picker").count() === 1, "which opens the picker every other list in this editor uses");
check((await page.locator(".picker .icon-tile").count()) === 71, "with the same grid inside it");

// The modal is a fixed height with the grid scrolling inside it; a grid that
// grew the dialog instead would push its own head off the screen.
{
  const shell = await page.locator(".picker").boundingBox();
  const grid = await page.locator(".picker .icon-sections").boundingBox();
  check(shell.height <= 760, `the dialog keeps its size (${Math.round(shell.height)}px)`);
  check(
    grid.y + grid.height <= shell.y + shell.height + 1,
    "and the grid scrolls within it rather than overflowing"
  );
}

await page.locator(".picker .icon-tile", { hasText: "thermostat" }).first().click();
await page.waitForTimeout(250);
check(await page.locator(".picker").count() === 0, "picking closes it");
check(
  (await page.locator(".icon-trigger .icon-trigger-glyph").count()) === 1,
  "and the trigger shows the icon that was picked"
);

await browser.close();

console.log(`\n${passes + failures} checks, ` + (failures ? `${failures} FAILED` : "all icon picker checks passed"));
process.exit(failures ? 1 : 0);
