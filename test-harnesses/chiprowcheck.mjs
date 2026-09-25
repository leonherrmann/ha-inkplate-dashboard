// WebKit pass over the editor canvas: that the chip row, the cells and every
// widget's picture are drawn where the panel draws them.
//
//   cd ha-inkplate-dashboard/dashboard/frontend && npx serve dist -l 8127
//   node ../../test-harnesses/chiprowcheck.mjs
//
// Reported 2026-09-24 as "the chip bar alignment and snapping, and at least the
// battery chip, are not right". Four faults, none of them visible to any other
// check, because each compared a thing with itself:
//
// - every render was offset by the difference between the gap and the margin
//   (4px right and 8px up on a V2 lying down), because the firmware's
//   screenshot generator measured from the gap and the preview drew at the
//   margin. A card snapped onto its cell looked as though it had missed it.
// - the cells and the chip band were drawn from the gap too, so the band a chip
//   snaps into was not where the chip went.
// - the manifest published the V2's chip widths on the V1, so the V1's battery
//   was a 126px drawing in a 175px box.
// - a layout's chips kept whatever y they were placed at and could share a
//   pixel after a rescue; the panel re-flows its own row, the editor did not.
//
// So this measures the drawn page, in the browser, against the grid the
// manifest publishes -- on both panels, since the margin is bigger than the gap
// on one and smaller on the other.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { webkit } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || "http://127.0.0.1:8127";

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

// Dumped from the firmware: `./sim/preview --manifest`, `./sim/preview-v1 --manifest`.
const V2 = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const V1 = JSON.parse(readFileSync(join(HERE, "manifest-v1.json"), "utf8"));

// Half a panel pixel either way, once the canvas has been scaled to the window
const TOLERANCE = 1.5;
const near = (a, b, slack = TOLERANCE) => Math.abs(a - b) <= slack;

// A page as the editor would place it on this grid -- two framed cards on their
// cells -- plus three chips stacked on one pixel above the row, which is what a
// rescue and a layout older than the 56px row between them leave behind.
function layoutFor(manifest) {
  const g = manifest.shapes.landscape;
  const pitchX = g.unit_w + g.gap_x;
  return {
    version: 1,
    rotation: 0,
    pages: [
      {
        id: "p1",
        name: "Home",
        chip_row: "bottom",
        widgets: [
          { id: "w1", type: "weather", size: "2x1", x: g.margin_x, y: g.margin_y, options: {} },
          { id: "w2", type: "room", size: "2x1", x: g.margin_x + 2 * pitchX, y: g.margin_y,
            options: { name: "Studio", icon: "rooms_desk" } },
          { id: "c1", type: "battery", x: g.margin_x, y: g.margin_y + 400, options: {} },
          { id: "c2", type: "wifi", x: g.margin_x, y: g.margin_y + 400, options: {} },
          { id: "c3", type: "mqtt", x: g.margin_x, y: g.margin_y + 400, options: {} },
        ],
      },
    ],
  };
}

const browser = await webkit.launch();

async function run(manifest, model) {
  const g = manifest.shapes.landscape;
  const layout = layoutFor(manifest);
  const saved = [];

  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on("pageerror", (error) => console.log("PAGEERROR: " + error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (/\/layout(\?|$)/.test(url) && request.method() !== "GET") {
      saved.push(JSON.parse(request.postData() || "{}"));
      return json({ ok: true });
    }
    if (/\/panels\b/.test(url)) {
      return json({
        panels: [{ id: "inkplate-a864a0", name: "Kitchen", model, online: true,
                   width: g.width, height: g.height, has_manifest: true }],
        default: "inkplate-a864a0",
      });
    }
    if (/\/status(\?|$)/.test(url)) {
      return json({ online: true, manifest, current_page: "p1", page_locked: false,
                    last_seen: Date.now() / 1000, settings: {} });
    }
    if (/\/layout(\?|$)/.test(url)) return json(saved.at(-1) || layout);
    if (/\/(areas|entities|devices|history)(\?|$)/.test(url)) return json([]);
    if (/\/images(\?|$)/.test(url)) return json({ images: [], base_url: "", device: { have: [] } });
    if (/\/albums(\?|$)/.test(url)) return json({ albums: [], refresh: {} });
    return json({});
  });

  await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
  await page.waitForSelector(".panel .widget", { timeout: 8000 });
  await page.waitForTimeout(600);

  // Everything in panel pixels: the canvas is scaled to fit the window.
  const drawn = await page.evaluate(() => {
    const panel = document.querySelector(".panel");
    const box = panel.getBoundingClientRect();
    const scale = box.width / panel.offsetWidth;
    const inPanel = (rect) => ({
      left: (rect.left - box.left) / scale,
      top: (rect.top - box.top) / scale,
      right: (rect.right - box.left) / scale,
      bottom: (rect.bottom - box.top) / scale,
    });
    const band = panel.querySelector(".chip-band");
    const cells = [...panel.querySelectorAll(".cells-layer .cell:not(.chip-band)")];
    return {
      band: band ? inPanel(band.getBoundingClientRect()) : null,
      firstCell: cells[0] ? inPanel(cells[0].getBoundingClientRect()) : null,
      widgets: [...panel.querySelectorAll(".widget")].map((element) => {
        const shot = element.querySelector(".pv-shot");
        return {
          text: element.textContent,
          box: inPanel(element.getBoundingClientRect()),
          shot: shot ? inPanel(shot.getBoundingClientRect()) : null,
        };
      }),
    };
  });

  const label = `${model} landscape`;
  const chipWidth = Object.fromEntries(
    manifest.widgets.filter((one) => one.chip).map((one) => [one.type, one.width])
  );

  // The grid
  check(drawn.firstCell && near(drawn.firstCell.left, g.margin_x),
        `${label}: the first cell is drawn at the margin, ${g.margin_x} (${drawn.firstCell?.left.toFixed(1)})`);
  check(drawn.band && near(drawn.band.left, g.margin_x) && near(drawn.band.right, g.width - g.margin_x),
        `${label}: the chip band runs margin to margin, ${g.margin_x}..${g.width - g.margin_x} ` +
        `(${drawn.band?.left.toFixed(1)}..${drawn.band?.right.toFixed(1)})`);
  const rowTop = g.height - g.margin_y - g.chip_h;
  check(drawn.band && near(drawn.band.top, rowTop) && near(drawn.band.bottom, rowTop + g.chip_h),
        `${label}: and sits where the panel's row is, ${rowTop}..${rowTop + g.chip_h}`);

  // The cards: a render starts on its own box, not a few pixels beside it
  const cards = drawn.widgets.slice(0, 2);
  for (const [index, card] of cards.entries()) {
    check(card.shot && near(card.shot.left, card.box.left) && near(card.shot.top, card.box.top),
          `${label}: card ${index + 1}'s picture starts on its box ` +
          `(${card.shot ? `${(card.shot.left - card.box.left).toFixed(1)}, ${(card.shot.top - card.box.top).toFixed(1)}` : "no shot"})`);
  }
  check(near(cards[0].box.left, drawn.firstCell.left) && near(cards[0].box.top, drawn.firstCell.top),
        `${label}: a card on the first cell is drawn exactly over it`);

  // The chips
  const chips = drawn.widgets.slice(2).sort((a, b) => a.box.left - b.box.left);
  check(chips.every((chip) => near(chip.box.top, rowTop) && near(chip.box.bottom, rowTop + g.chip_h)),
        `${label}: every chip box is the row, top ${chips.map((c) => c.box.top.toFixed(1)).join(", ")}`);
  check(chips.every((chip, i) => i === 0 || chip.box.left >= chips[i - 1].box.right + g.gap_x - TOLERANCE),
        `${label}: the stacked chips were spread along the row, a gap apart ` +
        `(${chips.map((c) => `${c.box.left.toFixed(0)}..${c.box.right.toFixed(0)}`).join(" ")})`);
  check(near(chips[0].box.left, g.margin_x), `${label}: and the first still starts at the margin`);
  check(saved.length > 0, `${label}: the settled row was saved, so the panel gets it too`);

  // The battery, which is bare: its picture is its whole width, reading and
  // cell, so it must end exactly where its box does and be centred in the row.
  const battery = drawn.widgets[2];
  check(near(battery.box.right - battery.box.left, chipWidth.battery),
        `${label}: the battery's box is the width it draws at, ${chipWidth.battery}`);
  check(battery.shot && near(battery.shot.right, battery.box.right),
        `${label}: its cell ends at the right of its box (${battery.shot ? (battery.box.right - battery.shot.right).toFixed(1) : "no shot"} short)`);
  const middle = (rect) => (rect.top + rect.bottom) / 2;
  check(battery.shot && near(middle(battery.shot), rowTop + g.chip_h / 2, 2),
        `${label}: and is centred in the row (${battery.shot ? (middle(battery.shot) - (rowTop + g.chip_h / 2)).toFixed(1) : "no shot"} off)`);
  for (const chip of chips.filter((one) => one !== battery)) {
    check(chip.shot && near(chip.shot.left, chip.box.left) && near(chip.shot.top, chip.box.top),
          `${label}: a framed chip's picture starts on its box`);
  }

  await page.close();
}

await run(V2, "inkplate5v2");
await run(V1, "inkplate5v1");
await browser.close();

console.log(`\n${passes + failures} checks, ${failures === 0 ? "all chip row checks passed" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
