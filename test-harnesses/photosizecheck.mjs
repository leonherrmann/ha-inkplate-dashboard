// The sizes the inspector offers, per shape, in WebKit.
//
// The firmware publishes every size that fits *either* of the panel's shapes,
// because the editor lays out both and a 3x6 photo is only any use on a panel
// on its side. So the editor has to trim the list to the shape being edited:
// offering 3x6 on an upright page puts a card through the bottom of the panel,
// and the panel drops it. Checked with the panel standing both ways up, since
// the manifest's live grid is whichever one it is standing in and neither may
// leak into the other shape's list.
//
// Then Full screen, which is no count of cells: choosing it puts the photo at
// 0,0 at the size of the shape being edited -- 1280x720 one way, 720x1280 the
// other -- whatever the panel is standing in, and a drag cannot move it off
// the corner. Its Border option goes, because the panel ignores it there.
//
//   cd ha-inkplate-dashboard/dashboard/frontend && npx vite build && npx serve dist -l 8127
//   cd ../../test-harnesses && node photosizecheck.mjs      (PORT=... to use another)
import { readFileSync } from "node:fs";
import { webkit } from "playwright";
import { arrangement } from "./arrangement.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const BASE = `http://127.0.0.1:${process.env.PORT || 8127}`;

const MANIFESTS = {
  upright: JSON.parse(readFileSync(HERE + "manifest.json", "utf8")),
  sideways: JSON.parse(readFileSync(HERE + "manifest-v2-portrait.json", "utf8")),
};

const WANT = {
  landscape: ["1x2", "3x2", "2x3", "3x3", "4x2", "5x3", "Full screen"],
  portrait: ["1x2", "3x2", "2x3", "3x3", "2x4", "3x6", "Full screen"],
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

const LAYOUT = () => ({
  version: 1,
  rotation: {},
  pages: [
    {
      id: "p1",
      name: "Photo",
      chip_row: "off",
      widgets: [{ id: "l1", type: "photo", size: "5x3", x: 41, y: 29, options: {} }],
      widgets_portrait: [{ id: "s1", type: "photo", size: "3x6", x: 23, y: 69, options: {} }],
    },
  ],
});

async function open(browser, manifest) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (/\/layout(\?|$)/.test(url)) {
      return request.method() !== "GET" ? json({ ok: true }) : json(LAYOUT());
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
  page.on("pageerror", (problem) => console.log("     pageerror: " + problem.message));
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForSelector(".panel .widget");
  return page;
}

const browser = await webkit.launch();

for (const [standing, manifest] of Object.entries(MANIFESTS)) {
  console.log(`\n--- the panel standing ${standing} ---`);
  const page = await open(browser, manifest);
  const select = arrangement(page);

  for (const which of ["landscape", "portrait"]) {
    await select.selectOption(which);
    await page.waitForTimeout(300);
    await page.locator(".panel .widget").first().click();
    await page.waitForSelector(".size-picker");
    const offered = (await page.locator(".size-picker button").allInnerTexts()).map((text) =>
      text.trim().replace("×", "x")
    );
    check(
      JSON.stringify(offered) === JSON.stringify(WANT[which]),
      `${which}: offers ${offered.join(" ")}`
    );
    const active = (await page.locator(".size-picker button.active").innerText()).trim().replace("×", "x");
    check(
      active === (which === "portrait" ? "3x6" : "5x3"),
      `${which}: with this arrangement's own size chosen (${active})`
    );

    // Full screen: the corner, the whole shape, and no Border to set.
    await page.locator(".size-picker button", { hasText: "Full screen" }).click();
    await page.waitForTimeout(250);
    const box = await page.locator(".panel .widget").first().evaluate((node) => ({
      x: parseFloat(node.style.left),
      y: parseFloat(node.style.top),
      w: parseFloat(node.style.width),
      h: parseFloat(node.style.height),
    }));
    const want = which === "portrait" ? [720, 1280] : [1280, 720];
    check(
      box.x === 0 && box.y === 0 && box.w === want[0] && box.h === want[1],
      `${which}: Full screen is ${box.w}x${box.h} at ${box.x},${box.y}`
    );
    const fields = await page.locator(".inspector").innerText();
    check(!/\bBorder\b/.test(fields), `${which}: and offers no Border`);
    const widget = page.locator(".panel .widget").first();
    const at = await widget.boundingBox();
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + at.width / 2 + 120, at.y + at.height / 2 + 90, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const moved = await widget.evaluate((node) => [node.style.left, node.style.top].join(","));
    check(moved === "0px,0px", `${which}: and a drag leaves it in the corner (${moved})`);

    await page.keyboard.press("Escape");
  }
  await page.close();
}

await browser.close();
console.log(`\n${passes + failures} checks, ` + (failures ? `${failures} FAILED` : "all photo size checks passed"));
process.exit(failures ? 1 : 0);
