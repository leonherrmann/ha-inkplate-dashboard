// WebKit pass over the editor canvas: that each panel is drawn with its own
// renders, at its own sizes.
//
//   cd ha-inkplate-dashboard/dashboard/frontend && npx serve dist -l 8127
//   node ../../test-harnesses/canvascheck.mjs
//
// The fault this exists for, reported from the editor on 2026-09-20: every card
// on an Inkplate 5 was the wrong size. The screenshots are real renders from the
// firmware, and they were only ever rendered on the V2 -- so a card drawn for a
// 220x166 cell was being laid over a 215x202 one. 26px too wide, up to 56px too
// short, on every card on that panel.
//
// Nothing in the suite could see it: the box is sized from the manifest and was
// always right, the image is sized from the index and was always right for the
// panel it was rendered on, and no check compared the two. This one does, on
// both panels, which is the only way the question even arises.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { webkit } from "playwright";
import { arrangement } from "./arrangement.mjs";

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

// Both manifests, dumped from the firmware: `./sim/preview --manifest` and
// `./sim/preview-v1 --manifest`. Hand-written ones would be testing a grid no
// panel has.
const V2 = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const V1 = JSON.parse(readFileSync(join(HERE, "manifest-v1.json"), "utf8"));
// The same panel stood on its side: 3 columns by 6 of the same 210x172 cell,
// its own gaps and margins, and a set of renders of its own.
const V2P = JSON.parse(readFileSync(join(HERE, "manifest-v2-portrait.json"), "utf8"));

// Sizes both panels offer, so the two runs are comparable widget for widget.
const LAYOUT = {
  version: 1,
  rotation: 0,
  pages: [
    {
      id: "p1",
      name: "Home",
      chip_row: "bottom",
      widgets: [
        { id: "w1", type: "clock", size: "2x1", x: 20, y: 20, options: {} },
        { id: "w2", type: "weather", size: "2x1", x: 20, y: 242, options: {} },
        { id: "w3", type: "room", size: "2x2", x: 490, y: 20, options: { name: "Studio", icon: "rooms_desk" } },
        { id: "w4", type: "entity_chip", x: 20, y: 470, options: { entity: "switch.a" } },
      ],
    },
  ],
};

// Which of the widgets above draw a card frame, in the layout's own order. A
// framed widget is laid out for the box it is given and fills it; the clock is
// digits on the page and an entity chip measures itself, so both are cropped to
// their ink and sit inside their box.
const FRAMED = [false, true, true, false];

// A card's render includes the offset shadow the firmware draws outside its
// rectangle, so the image is legitimately a few pixels larger than the box.
// Anything beyond that is the wrong panel's picture.
const SHADOW = 8;

const browser = await webkit.launch();

async function canvas(manifest, model) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on("pageerror", (error) => console.log("PAGEERROR: " + error.message));
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (/\/panels\b/.test(url)) {
      return json({
        panels: [
          {
            id: "inkplate-a864a0",
            name: "Kitchen",
            model,
            online: true,
            width: manifest.display.width,
            height: manifest.display.height,
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
    if (/\/(areas|entities|devices|history)(\?|$)/.test(url)) return json([]);
    if (/\/images(\?|$)/.test(url)) return json({ images: [], base_url: "", device: { have: [] } });
    if (/\/albums(\?|$)/.test(url)) return json({ albums: [], refresh: {} });
    return json({});
  });

  await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
  await page.waitForSelector(".panel .widget", { timeout: 8000 });

  // Measured off the laid-out rectangles rather than the inline styles. A chip
  // takes no size from the grid, so its .pv carries no width or height to read
  // -- and parsing one that is not there gives NaN, which silently compares
  // false against everything and drops the widget out of every check below. The
  // chips were the ones that broke.
  //
  // Both rectangles come back in screen pixels, through the same canvas scale,
  // so they are comparable to each other; the scale is recovered from the image
  // to put the tolerances back into panel pixels.
  const drawn = await page.evaluate(() =>
    [...document.querySelectorAll(".panel .widget")].map((el) => {
      const pv = el.querySelector(".pv");
      const img = el.querySelector(".pv-shot");
      if (!pv || !img) return { box: null, shot: null, at: null, src: null };
      const boxRect = pv.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      const scale = img.width ? imgRect.width / img.width : 1;
      const back = (value) => Math.round(value / scale);
      return {
        box: [back(boxRect.width), back(boxRect.height)],
        shot: [img.width, img.height],
        // Where the render sits relative to its box, in panel pixels.
        at: [back(imgRect.left - boxRect.left), back(imgRect.top - boxRect.top)],
        src: img.getAttribute("src"),
      };
    })
  );
  await page.close();
  return drawn;
}

console.log("--- the Inkplate 5 V2 ---");
const v2 = await canvas(V2, "inkplate5v2");
console.log("--- the Inkplate 5 (960x540) ---");
const v1 = await canvas(V1, "inkplate5v1");
console.log("--- the V2 on its side ---");
const v2p = await canvas(V2P, "inkplate5v2");

for (const [label, drawn, expected] of [
  ["V2", v2, LAYOUT.pages[0].widgets.length],
  ["V1", v1, LAYOUT.pages[0].widgets.length],
  // One fewer sideways, and that is the point rather than a fault: this page
  // has no sideways arrangement, so the editor shows the upright one bent onto
  // the portrait grid -- exactly what the panel draws for it -- and the 2x2 at
  // column 2 has no cell on a grid three columns wide.
  ["V2 portrait", v2p, LAYOUT.pages[0].widgets.length - 1],
]) {
  check(drawn.length === expected,
        `${label}: ${drawn.length} widget(s) on the canvas, expecting ${expected}`);

  const cells = drawn.filter((one) => one.box && one.shot);
  check(cells.length >= 3, `${label}: and drawn from renders rather than CSS previews`);

  const oversize = cells.filter(
    (one) => one.shot[0] > one.box[0] + SHADOW || one.shot[1] > one.box[1] + SHADOW
  );
  check(
    oversize.length === 0,
    oversize.length === 0
      ? `${label}: no render is larger than the box it sits in`
      : `${label}: ${oversize.length} render(s) overflow, e.g. ${JSON.stringify(oversize[0].shot)} in ${JSON.stringify(oversize[0].box)}`
  );

  // Where it is put, not just how big it is. The offset comes from the
  // generator, which measures each render against the position the simulator
  // drew it at -- and that position is the *panel's* margin, which is 20 on one
  // and 30 on the other. Measured against the wrong one, every card sat 10px
  // out of its box and every chip was placed 434px below it, which drew the
  // chip row's previews off the bottom of the canvas. The pictures were right
  // the whole time; only where to put them was wrong.
  const misplaced = cells.filter(
    (one) =>
      one.at[0] < -SHADOW ||
      one.at[1] < -SHADOW ||
      one.at[0] >= one.box[0] ||
      one.at[1] >= one.box[1]
  );
  check(
    misplaced.length === 0,
    misplaced.length === 0
      ? `${label}: and every render is placed inside the box it belongs to`
      : `${label}: ${misplaced.length} render(s) placed outside their box, e.g. at ${JSON.stringify(misplaced[0].at)} in ${JSON.stringify(misplaced[0].box)}`
  );

  // The other half: a render much *smaller* than its box is the same fault seen
  // from the other side. Only for the widgets that draw a frame -- the clock and
  // the chips are cropped to their own ink and are meant to sit inside the box
  // rather than fill it, which is why this is read off the layout instead of
  // guessed from the numbers. Guessing called the clock a card and failed on a
  // panel that was drawing it perfectly.
  const framed = drawn.filter((one, at) => FRAMED[at] && one.box && one.shot);
  const undersize = framed.filter((one) => one.shot[1] < one.box[1] - SHADOW);
  check(
    undersize.length === 0,
    undersize.length === 0
      ? `${label}: nor smaller than it, so a card fills its own footprint`
      : `${label}: ${undersize.length} render(s) fall short, e.g. ${JSON.stringify(undersize[0].shot)} in ${JSON.stringify(undersize[0].box)}`
  );
}

// The two panels' boxes really are different shapes -- if they were not, the
// checks above would pass without proving anything.
check(
  JSON.stringify(v1[1].box) !== JSON.stringify(v2[1].box),
  `the same widget has a different footprint on each panel (${JSON.stringify(v1[1].box)} against ${JSON.stringify(v2[1].box)})`
);
check(
  v1[1].src !== v2[1].src,
  "and a different picture, which is the whole point: one panel's render is not the other's"
);

// And the same panel turned: same cell, different arrangement, different
// renders. If these came back equal the portrait set would be the landscape one
// wearing a different name.
check(
  v2p[1].src !== v2[1].src,
  "a panel on its side draws from its own set, not the upright one's"
);
// The *cell* is the same either way up; a widget spanning two of them is not,
// because it swallows a gap and the gaps differ per shape -- 22 across in
// portrait against 37 in landscape. So the heights match and the widths do not.
check(
  v2p[1].box[1] === v2[1].box[1],
  `a 2x1 is the same height either way up (${v2p[1].box[1]}), because the cell is`
);
check(
  v2p[1].box[0] < v2[1].box[0],
  `and narrower across, by the gap it swallows (${v2p[1].box[0]} against ${v2[1].box[0]})`
);

// --- a page keeps an arrangement per shape ----------------------------------
//
// The fault this covers: there was one arrangement, so turning the panel
// re-flowed it and saving afterwards wrote the re-flow back over the
// arrangement it came from. The two are independent now, and the toolbar
// switches between them.

console.log("--- the two arrangements of one page ---");

{
  const LAYOUT_BOTH = {
    version: 1,
    rotation: 0,
    pages: [{
      id: "p1", name: "Home", chip_row: "bottom",
      widgets: [
        { id: "w1", type: "clock", size: "2x1", x: 41, y: 29, options: {} },
        { id: "w2", type: "climate", size: "2x2", x: 535, y: 29, options: {} },
      ],
      // Deliberately one widget, where upright has two: if the editor were
      // showing the upright arrangement, the count would give it away.
      widgets_portrait: [
        { id: "p1w", type: "climate", size: "2x2", x: 23, y: 23, options: {} },
      ],
    }],
  };

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => console.log("PAGEERROR: " + error.message));
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (/\/panels\b/.test(url)) {
      return json({ panels: [{ id: "inkplate-a864a0", name: "Kitchen", model: "inkplate5v2",
                               online: true, width: 1280, height: 720, has_manifest: true }],
                    default: "inkplate-a864a0" });
    }
    if (/\/status(\?|$)/.test(url)) {
      return json({ online: true, manifest: V2, current_page: "p1", page_locked: false,
                    last_seen: Date.now() / 1000, settings: {} });
    }
    if (/\/layout(\?|$)/.test(url)) return json(LAYOUT_BOTH);
    if (/\/(areas|entities|devices|history)(\?|$)/.test(url)) return json([]);
    if (/\/images(\?|$)/.test(url)) return json({ images: [], base_url: "", device: { have: [] } });
    if (/\/albums(\?|$)/.test(url)) return json({ albums: [], refresh: {} });
    return json({});
  });

  await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
  await page.waitForSelector(".panel .widget", { timeout: 8000 });

  const switcher = arrangement(page);
  check(await switcher.count() === 1, "the toolbar offers the two arrangements");

  const canvas = async () => {
    const panel = await page.locator(".panel-outer .panel").first().boundingBox();
    return {
      widgets: await page.locator(".panel .widget").count(),
      // Which way up the canvas is drawn, from its own proportions.
      tall: panel.height > panel.width,
    };
  };

  const upright = await canvas();
  check(upright.widgets === 2, `upright shows its own two widgets (${upright.widgets})`);
  check(!upright.tall, "on a canvas wider than it is tall");

  await switcher.selectOption("portrait");
  await page.waitForTimeout(400);
  const sideways = await canvas();
  check(sideways.widgets === 1, `sideways shows its own one widget (${sideways.widgets})`);
  check(sideways.tall, "on a canvas taller than it is wide");

  await switcher.selectOption("landscape");
  await page.waitForTimeout(400);
  const back = await canvas();
  check(back.widgets === 2, "switching back finds the upright arrangement untouched");

  await page.close();
}

await browser.close();

console.log(`\n${passes + failures} checks, ` + (failures ? `${failures} FAILED` : "all canvas checks passed"));
process.exit(failures ? 1 : 0);
