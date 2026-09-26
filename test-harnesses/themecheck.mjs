// WebKit pass over the dark theme.
//
//   cd ha-inkplate-dashboard/dashboard/frontend && npx serve dist -l 8127
//   node ../../test-harnesses/themecheck.mjs [--shots DIR]
//
// Every colour in the stylesheet is meant to be a token, and the dark theme is
// a block of overrides -- so the way it breaks is a rule with a literal colour
// in it, which stays light. That is invisible in a light render and obvious in
// a dark one, but only on the screen and in the state that uses the rule. So
// this walks every screen, the sheets and pickers too, and asks two questions
// of each visible element rather than trusting a look at the screenshots:
//
//   - does anything outside the canvas still paint an opaque white box?
//   - does any text sit on a background it cannot be read against?
//
// And the choice itself: the OS decides when nothing else does, a choice made
// here beats it and survives a reload, and the canvas stays black on white.
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { webkit } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:8127";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const shotsAt = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : null;
if (shotsAt) mkdirSync(shotsAt, { recursive: true });

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
      widgets: [
        { id: "w1", type: "room", size: "2x3", x: 0, y: 0, options: { name: "Living room", area: "a1" } },
        { id: "w2", type: "clock", size: "2x1", x: 530, y: 490, options: {} },
      ],
    },
    { id: "p2", name: "Weather", widgets: [] },
  ],
};

const AREAS = [
  {
    id: "a1",
    name: "Living room",
    entities: [
      { entity_id: "sensor.multi_temp", name: "Multisensor temperature", domain: "sensor", device_class: "temperature" },
      { entity_id: "light.lamp", name: "Lamp", domain: "light", device_class: "" },
    ],
  },
];

async function install(page) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (/\/panels\b/.test(url)) {
      return json({
        panels: [
          { id: "inkplate-057090", name: "Hallway", model: "inkplate5v2", online: true, width: 1280, height: 720, has_manifest: true },
        ],
        default: "inkplate-057090",
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
        draft_pushed: false,
      });
    }
    if (/\/layout(\?|$)/.test(url)) return json(LAYOUT);
    if (/\/areas(\?|$)/.test(url)) return json(AREAS);
    if (/\/entities(\?|$)/.test(url)) return json(AREAS[0].entities);
    if (/\/devices(\?|$)/.test(url)) return json([]);
    if (/\/images(\?|$)/.test(url)) return json({ images: [], base_url: "", device: { have: [] } });
    if (/\/albums(\?|$)/.test(url)) return json({ albums: [], refresh: {} });
    if (/\/history(\?|$)/.test(url)) return json({ history: [] });
    return json({});
  });
}

// Runs in the page. An element's own background if it paints one, else the
// nearest ancestor's; alpha is composited over what is under it, so glass
// over the ground reads as what it looks like rather than as transparent.
function audit() {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  });
  const ground = parse(getComputedStyle(document.body).backgroundColor);
  const backdrop = (el) => {
    const stack = [];
    for (let at = el; at && at !== document.documentElement; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (style.backgroundImage !== "none" && !at.matches("body")) return null; // a gradient: cannot judge
      const bg = parse(style.backgroundColor);
      if (bg && bg.a > 0) {
        stack.push(bg);
        if (bg.a >= 1) break;
      }
    }
    let colour = ground;
    for (let i = stack.length - 1; i >= 0; i--) colour = over(stack[i], colour);
    return colour;
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const name = (el) =>
    el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : "");
  // The canvas, and everything else that holds a picture of the panel: those
  // sit on --picture, which is white paper in both themes by design.
  const exempt = (el) =>
    el.closest(
      ".panel, .panel-scaler, .page-thumb, .widget-card-shot, .option-item-shot, .option-preview, " +
        ".image-row-thumb, .image-item, .editor-figure, img, canvas, svg"
    );
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.opacity !== "0" && !el.closest(".sr-only");
  };

  const onAccent = (el) => {
    for (let at = el.parentElement; at && at !== document.body; at = at.parentElement) {
      if (getComputedStyle(at).backgroundImage.includes("gradient")) return true;
    }
    return false;
  };

  const white = [];
  const faint = [];
  for (const el of document.querySelectorAll("body *")) {
    if (exempt(el) || !visible(el)) continue;
    const s = getComputedStyle(el);
    const bg = parse(s.backgroundColor);
    // White on the gradient is on the accent, not on the theme, and stays white
    if (bg && bg.a > 0.5 && bg.r > 235 && bg.g > 235 && bg.b > 235 && !onAccent(el)) white.push(name(el));

    // Disabled controls are dimmed on purpose, and exempt from contrast rules
    if (el.closest(":disabled")) continue;
    const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!text) continue;
    const fg = parse(s.color);
    const under = backdrop(el);
    if (!fg || !under) continue;
    const seen = over({ ...fg, a: fg.a * Number(s.opacity) }, under);
    const ratio = contrast(seen, under);
    // 3 rather than 4.5: this is hunting for the broken, not grading the kept
    if (ratio < 3) faint.push(`${name(el)} "${el.textContent.trim().slice(0, 24)}" ${ratio.toFixed(2)}`);
  }
  return { white: [...new Set(white)], faint: [...new Set(faint)] };
}

const browser = await webkit.launch();

// ---------- who decides ----------

for (const scheme of ["light", "dark"]) {
  const context = await browser.newContext({ viewport: DESKTOP, colorScheme: scheme });
  const page = await context.newPage();
  await install(page);
  await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
  check(
    (await page.evaluate(() => document.documentElement.dataset.theme)) === scheme,
    `unset, it follows the OS when there is no Home Assistant above it (${scheme})`
  );
  await context.close();
}

{
  const context = await browser.newContext({ viewport: DESKTOP, colorScheme: "light" });
  const page = await context.newPage();
  await install(page);
  await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
  await page.locator(".rail-item[aria-label=Device]").click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "choosing Dark turns it dark on a light OS");
  await page.reload({ waitUntil: "networkidle" });
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "and it is still dark after a reload");
  check(
    (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) !== "rgb(239, 236, 230)",
    "with the dark ground, not the light one"
  );
  await page.locator(".rail-item[aria-label=Device]").click();
  await page.getByRole("button", { name: "Auto", exact: true }).click();
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === "light", "Auto hands it back to the OS");
  await context.close();
}

// ---------- every screen, both themes ----------

// Light as well: the audit's text check is theme-blind, and a rule that breaks
// in the light is no better for having been found while looking at the dark.
for (const [label, viewport, mobile, scheme] of [
  ["desktop dark", DESKTOP, false, "dark"],
  ["phone dark", PHONE, true, "dark"],
  ["desktop light", DESKTOP, false, "light"],
  ["phone light", PHONE, true, "light"],
]) {
  const context = await browser.newContext({ viewport, colorScheme: scheme, hasTouch: mobile, isMobile: mobile });
  const page = await context.newPage();
  await install(page);
  await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
  await page.waitForSelector(".panel .widget", { timeout: 5000 });

  const nav = mobile ? ".tabbar-item" : ".rail-item";
  const go = async (section) => {
    if (mobile) await page.locator(nav, { hasText: section }).click();
    else await page.locator(`${nav}[aria-label=${section}]`).click();
    await page.waitForTimeout(250);
  };

  const inspect = async (what) => {
    const { white, faint } = await page.evaluate(audit);
    if (scheme === "dark")
      check(white.length === 0, `${label} ${what}: no white box left outside the canvas${white.length ? " -- " + white.slice(0, 6).join(", ") : ""}`);
    check(faint.length === 0, `${label} ${what}: all text readable${faint.length ? " -- " + faint.slice(0, 6).join("; ") : ""}`);
    if (shotsAt) await page.screenshot({ path: join(shotsAt, `${label}-${what.replace(/\W+/g, "-")}.png`), fullPage: true });
  };

  {
    const paper = await page.evaluate(() => getComputedStyle(document.querySelector(".panel")).backgroundColor);
    check(paper === "rgb(255, 255, 255)", `${label}: the canvas is white paper (${paper})`);
  }

  await inspect("editor");
  await page.locator(".panel .widget").first().click();
  await page.waitForTimeout(350);
  await inspect("editor, widget selected");
  if (mobile) {
    await page.locator(".sheet-summary").click();
    await page.waitForTimeout(350);
    await inspect("options sheet");
  }

  await go("Pages");
  await inspect("pages");
  await go("Device");
  await inspect("device");
  if (mobile) {
    await page.locator(".setting-row", { hasText: "Appearance" }).click();
    await page.waitForTimeout(250);
    await inspect("appearance");
    await page.getByLabel("Back to Device").click();
  }
  await page.locator(mobile ? ".setting-row" : ".action-row", { hasText: "Diagnostics & firmware" }).click();
  await page.waitForTimeout(250);
  await inspect("diagnostics");
  await go("Images");
  await inspect("images");

  // A picker is a dialog over everything, and the one screen the harness used
  // to miss -- see the broken widget picker that shipped in 2026.9.36.
  await go("Editor");
  const add = page.locator("button", { hasText: /^Add widget$|^Add$/ }).first();
  if (await add.count()) {
    await add.click();
    await page.waitForTimeout(350);
    await inspect("widget picker");
  }
  await context.close();
}

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
