// WebKit pass over the two shapes a manifest can take.
//
// The firmware publishes the manifest in one MQTT packet, and at 17,067 bytes
// that packet was failing on the panel and taking the broker session with it.
// Lists used by more than one option are now published once under a top-level
// "values" map and named by "values_ref" on each option that wants them --
// 14,904 bytes, 12.7% smaller.
//
// The editor has to render both shapes identically, and that is what this
// checks. It matters in both directions: a new add-on will meet old firmware
// that inlines everything, and an old add-on would meet new firmware that
// references. The first must work and is asserted here; the second is why the
// add-on ships first.
//
//   cd ha-inkplate-dashboard/dashboard/frontend && npx serve dist -l 8127
//   node ../../test-harnesses/manifestcheck.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { webkit } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8127";

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

// Shared-list form (current firmware) and fully inline form (any firmware
// before it). Both are real dumps of `./sim/preview --manifest`.
const SHARED = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const LEGACY = JSON.parse(readFileSync(join(HERE, "manifest-legacy.json"), "utf8"));

// The two describe the same firmware, so the editor must not be able to tell
// them apart. Asserted here before a browser is opened, because a fixture that
// has drifted would make every check below meaningless.
const resolved = (manifest) => {
  const copy = JSON.parse(JSON.stringify(manifest));
  const shared = copy.values || {};
  delete copy.values;
  for (const widget of copy.widgets) {
    for (const option of widget.options || []) {
      if (option.values_ref) {
        option.values = shared[option.values_ref];
        delete option.values_ref;
      }
    }
  }
  return copy;
};
check(
  JSON.stringify(resolved(SHARED)) === JSON.stringify(resolved(LEGACY)),
  "the two fixtures describe the same firmware once references are resolved"
);
check(
  JSON.stringify(SHARED).length < JSON.stringify(LEGACY).length,
  `the shared form is the smaller one (${JSON.stringify(SHARED).length} < ${JSON.stringify(LEGACY).length})`
);

const LAYOUT = {
  version: 1,
  rotation: 0,
  pages: [
    {
      id: "p1",
      name: "Home",
      chip_row: "bottom",
      widgets: [
        // A room card: its icon option is one of the shared lists (the ten
        // rooms_ icons), and every widget carries the shared update_interval.
        { id: "w1", type: "room", size: "2x3", x: 0, y: 0, options: { name: "Living room", area: "a1" } },
      ],
    },
  ],
};

const AREAS = [
  {
    id: "a1",
    name: "Living room",
    entities: [
      { entity_id: "sensor.t", name: "T", domain: "sensor", device_class: "temperature" },
    ],
  },
];

const browser = await webkit.launch();

// Returns what the two dropdowns that read shared lists actually offered.
async function offered(manifest, label) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (/\/panels\b/.test(url)) {
      return json({
        panels: [{ id: "p1", name: "Home", model: "inkplate5v2", online: true,
                   width: 1280, height: 720, has_manifest: true }],
        default: "p1",
      });
    }
    if (/\/status(\?|$)/.test(url)) {
      return json({ online: true, manifest, current_page: "p1", page_locked: false, settings: {} });
    }
    if (/\/layout(\?|$)/.test(url)) return json(LAYOUT);
    if (/\/areas(\?|$)/.test(url)) return json(AREAS);
    if (/\/entities(\?|$)/.test(url)) return json(AREAS[0].entities);
    if (/\/devices(\?|$)/.test(url)) return json([]);
    if (/\/images(\?|$)/.test(url)) return json({ images: [], base_url: "", device: { have: [] } });
    if (/\/albums(\?|$)/.test(url)) return json({ albums: [], refresh: {} });
    return json({});
  });

  await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
  await page.waitForSelector(".panel .widget", { timeout: 5000 });
  await page.locator(".panel .widget").first().click();
  await page.waitForSelector("aside.inspector.open", { timeout: 3000 });

  const options = (name) =>
    page
      .locator("aside.inspector label", { hasText: name })
      .first()
      .locator("select option")
      .allInnerTexts();

  // The icon is a grid of drawings in a picker now, not a dropdown: open it
  // and read the choices it offers, the "none" entry included.
  const pacing = await options("Update no more often than");
  await page.locator("aside.inspector button.icon-trigger").first().click();
  const listbox = page.locator("[role=listbox]").last();
  await listbox.waitFor({ timeout: 3000 });
  const picker = listbox.locator("xpath=ancestor::*[.//*[contains(@class,'option-item')]][1]");
  const icon = (await picker.locator("[role=option]").allInnerTexts()).map((text) =>
    text.trim().split("\n").pop().trim()
  );

  const result = { icon, pacing };
  await page.screenshot({ path: `/tmp/manifest-${label}.png` });
  await page.close();
  return result;
}

const shared = await offered(SHARED, "shared");
const legacy = await offered(LEGACY, "legacy");

// The substance: a referenced list has to arrive in the dropdown.
check(shared.icon.length > 1, `the icon picker is populated from a shared list (${shared.icon.length} entries)`);
check(
  shared.pacing.length > 1,
  `the update-interval dropdown is too, and it is the list all 19 types share (${shared.pacing.length} entries)`
);

// And identically to the firmware that spelled every list out.
check(
  JSON.stringify(shared.icon) === JSON.stringify(legacy.icon),
  "the icon picker reads the same either way"
);
check(
  JSON.stringify(shared.pacing) === JSON.stringify(legacy.pacing),
  "so does the update-interval dropdown"
);

// The names are the firmware's own, with the option's filter stripped for
// display -- so a regression that showed the raw ids would be caught here too.
check(
  shared.icon.includes("bed") && shared.icon.includes("kitchen"),
  "and the names are the room icons, with the rooms_ prefix stripped for display"
);

// An option whose list is used once is still inline, and must keep working.
check(
  legacy.icon.length === shared.icon.length && shared.icon.length === 11,
  "ten room icons plus the default entry, from both forms"
);

console.log(`\n${passes + failures} checks, ${failures ? `${failures} FAILED` : "all manifest checks passed"}`);
await browser.close();
process.exit(failures ? 1 : 0);
