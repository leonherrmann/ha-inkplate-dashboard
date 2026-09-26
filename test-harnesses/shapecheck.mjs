// Editing a page in two shapes, in WebKit.
//
// A page keeps an arrangement per shape and the toolbar switches between them.
// Everything picturing a page therefore has to be told *which* shape it is
// picturing, and three things were not:
//
//   * the canvas fitted the panel's width, which is the same as its long side
//     only while a panel is wider than it is tall. 720 fits any screen, so a
//     portrait page came out at 1:1 -- a window full of the top third of it.
//   * the Pages tab drew `page.widgets` into whatever box it was handed, so with
//     the sideways arrangement open every thumbnail was a portrait box holding
//     the upright arrangement at landscape coordinates.
//   * the stranded-widget rescue measured the upright arrangement against the
//     shape being *edited*. Switching to sideways made every card past x=720 off
//     the panel, and it rewrites the layout without asking. This is the one that
//     destroys work rather than merely looking wrong, and it is checked first.
//
//   cd ha-inkplate-dashboard/dashboard/frontend && npx vite build && npx serve dist -l 8127
//   cd ../../test-harnesses && node shapecheck.mjs
import { readFileSync } from "node:fs";
import { webkit } from "playwright";
import { arrangement } from "./arrangement.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const BASE = "http://127.0.0.1:8127";

const MANIFESTS = {
  upright: JSON.parse(readFileSync(HERE + "manifest.json", "utf8")),
  sideways: JSON.parse(readFileSync(HERE + "manifest-v2-portrait.json", "utf8")),
};

let passes = 0;
let failures = 0;
const check = (ok, what) => {
  if (ok) {
    passes += 1;
    console.log("ok   " + what);
  } else {
    failures += 1;
    console.log("FAIL " + what);
  }
};

// Two pages. The first is laid out in both shapes, deliberately differently --
// not the same cards reflowed. The second has no sideways arrangement at all,
// which is every page written before this existed.
const LAYOUT = () => ({
  version: 1,
  rotation: {},
  pages: [
    {
      id: "p1",
      name: "Home",
      chip_row: "bottom",
      widgets: [
        // The far column: x=1034 is the fifth cell of the landscape grid, and is
        // off a 720-wide panel. This is what the rescue used to sweep away.
        { id: "l1", type: "clock", size: "2x1", x: 41, y: 29, options: {} },
        { id: "l2", type: "climate", size: "1x1", x: 1034, y: 29, options: {} },
      ],
      widgets_portrait: [
        { id: "s1", type: "climate", size: "2x2", x: 23, y: 23, options: {} },
        { id: "s2", type: "clock", size: "2x1", x: 23, y: 411, options: {} },
        { id: "s3", type: "climate", size: "1x1", x: 23, y: 799, options: {} },
      ],
    },
    {
      id: "p2",
      name: "Inherited",
      chip_row: "bottom",
      widgets: [{ id: "i1", type: "climate", size: "2x2", x: 41, y: 29, options: {} }],
    },
  ],
});

async function open(browser, manifest) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // What the editor saved, so a check can see whether anything rewrote it.
  const saved = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (/\/layout(\?|$)/.test(url)) {
      if (request.method() !== "GET") {
        saved.push(JSON.parse(request.postData() || "{}"));
        return json({ ok: true });
      }
      return json(LAYOUT());
    }
    if (/\/panels\b/.test(url)) {
      return json({
        panels: [{
          id: "inkplate-a864a0",
          name: "Kitchen",
          model: "inkplate5v2",
          online: true,
          width: manifest.display.width,
          height: manifest.display.height,
          has_manifest: true,
        }],
        default: "inkplate-a864a0",
      });
    }
    if (/\/status(\?|$)/.test(url)) {
      return json({
        online: true,
        manifest,
        current_page: "p1",
        page_locked: false,
        draft_pushed: true,
        applied: { ok: true, version: 1 },
        pushed_version: 1,
        last_seen: Date.now() / 1000,
        server_time: Date.now() / 1000,
        settings: {},
      });
    }
    if (/\/(areas|entities|devices|history)(\?|$)/.test(url)) return json([]);
    if (/\/images(\?|$)/.test(url)) return json({ images: [], base_url: "", device: { have: [] } });
    if (/\/albums(\?|$)/.test(url)) return json({ albums: [], refresh: {} });
    return json({});
  });
  page.on("console", (message) => {
    if (message.type() === "error") console.log("     console: " + message.text());
  });
  page.on("pageerror", (problem) => console.log("     pageerror: " + problem.message));
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForSelector(".panel .widget");
  return { page, saved };
}

const shapeSelect = (page) =>
  arrangement(page);

async function canvasBox(page) {
  return page.locator(".panel-outer .panel").first().boundingBox();
}

const browser = await webkit.launch();

for (const [standing, manifest] of Object.entries(MANIFESTS)) {
  console.log(`\n--- the panel standing ${standing} ---`);
  const { page, saved } = await open(browser, manifest);
  const select = shapeSelect(page);

  // The switch opens on the shape the panel is actually standing in.
  check(
    (await select.inputValue()) === (standing === "upright" ? "landscape" : "portrait"),
    `the switch opens on the shape the panel is standing in (${await select.inputValue()})`
  );

  for (const which of ["landscape", "portrait"]) {
    await select.selectOption(which);
    await page.waitForTimeout(300);
    const portrait = which === "portrait";

    const label = await select.label();
    check(
      label.startsWith(portrait ? "Sideways" : "Upright"),
      `${which}: the switch says "${label}"`
    );

    // The canvas is the shape that was chosen, and fits the window.
    const box = await canvasBox(page);
    check(
      portrait ? box.height > box.width : box.width > box.height,
      `${which}: the canvas is that shape (${Math.round(box.width)}x${Math.round(box.height)})`
    );
    check(box.width <= 1440, `${which}: and no wider than the window`);
    // The long side is what is fitted, so both shapes come out the same scale --
    // which is the truth of this grid, the cell being 210x172 either way up.
    check(
      Math.abs(Math.max(box.width, box.height) - 754) < 12,
      `${which}: fitted by its long side, the same scale as the other shape (${Math.round(Math.max(box.width, box.height))})`
    );

    // The arrangement on the canvas is that shape's own.
    const count = await page.locator(".panel .widget").count();
    check(
      count === (portrait ? 3 : 2),
      `${which}: ${count} widgets on the canvas, the arrangement for this shape`
    );

    // The Pages tab pictures the same shape, box and contents together.
    await page.locator('.rail-item[aria-label="Pages"]').click();
    await page.waitForSelector(".page-thumb");
    const thumb = await page.locator(".page-thumb").first().boundingBox();
    check(
      portrait ? thumb.height > thumb.width : thumb.width > thumb.height,
      `${which}: the page thumbnail is that shape too (${Math.round(thumb.width)}x${Math.round(thumb.height)})`
    );
    check(
      Math.max(thumb.width, thumb.height) <= 130,
      `${which}: and the same size either way up, so the rows do not jump`
    );
    const inThumb = await page.locator(".page-thumb").first().locator(".panel > div").count();
    check(
      inThumb === (portrait ? 3 : 2),
      `${which}: holding this shape's ${inThumb} widgets, not the other's`
    );

    // Everything in the thumbnail is inside it -- the check that catches
    // landscape coordinates in a portrait box.
    const spill = await page.locator(".page-thumb").first().evaluate((node) => {
      const box = node.getBoundingClientRect();
      let worst = 0;
      for (const child of node.querySelectorAll(".panel > div")) {
        const one = child.getBoundingClientRect();
        worst = Math.max(worst, one.right - box.right, one.bottom - box.bottom);
      }
      return Math.round(worst);
    });
    check(spill <= 2, `${which}: with nothing hanging out of it (${spill}px)`);

    await page.locator('.rail-item[aria-label="Editor"]').click();
    await page.waitForSelector(".panel .widget");
  }

  // Nothing was saved by any of that. Switching shapes and looking at pages is
  // not an edit, and the rescue used to make it one.
  check(saved.length === 0, `nothing was written to the layout by switching shapes (${saved.length} writes)`);

  // And the upright arrangement still has its far-column card, which is the
  // specific thing the rescue moved.
  await shapeSelect(page).selectOption("landscape");
  await page.waitForTimeout(250);
  const far = await page.locator(".panel .widget").evaluateAll((nodes) =>
    nodes.map((node) => Math.round(parseFloat(node.style.left || "0")))
  );
  check(
    far.some((x) => x > 900),
    `the card in the far column is still in the far column (${far.join(", ")})`
  );

  await page.close();
}

await browser.close();
console.log(`\n${passes + failures} checks, ` + (failures ? `${failures} FAILED` : "all shape checks passed"));
process.exit(failures ? 1 : 0);
