// WebKit pass over the mobile options sheet -- design 1b. Editor bugs in this
// repo have been Safari-only more than once, and the add-on is always inside an
// iframe on iOS, so a Chromium run proves nothing.
//
//   cd ha-inkplate-dashboard/dashboard/frontend && npx serve dist -l 8127
//   node ../../test-harnesses/sheetcheck.mjs
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
      widgets: [
        { id: "w1", type: "room", size: "2x3", x: 0, y: 0, options: { name: "Living room", area: "a1" } },
        { id: "w2", type: "clock", size: "2x1", x: 530, y: 490, options: {} },
      ],
    },
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

await page.route("**/api/**", async (route) => {
  const url = route.request().url();
  const json = (body) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  // The device dropdown. Every panel-scoped call carries ?panel=, so the
  // regexes below end at a query string rather than at the path -- and without
  // this route the editor has no panel to be about and loads nothing.
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
  if (/\/areas(\?|$)/.test(url)) return json(AREAS);
  if (/\/entities(\?|$)/.test(url)) return json(AREAS[0].entities);
  if (/\/devices(\?|$)/.test(url)) return json([]);
  if (/\/images(\?|$)/.test(url)) return json({ images: [], base_url: "", device: { have: [] } });
  if (/\/albums(\?|$)/.test(url)) return json({ albums: [], refresh: {} });
  if (/\/history(\?|$)/.test(url)) return json({ history: [] });
  return json({});
});

await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
await page.waitForSelector(".panel .widget", { timeout: 5000 });

const sheet = page.locator(".sheet");
const box = async (locator) => locator.boundingBox();

// ---------- nothing selected ----------

check(await sheet.count() === 0, "no widget selected means no sheet, not an empty strip");

// ---------- peek ----------

await page.locator(".panel .widget").first().click();
await page.waitForSelector(".sheet", { timeout: 3000 });

check(await sheet.getAttribute("class").then((c) => c.includes("sheet-peek")), "selecting a widget opens the sheet at peek");
check(
  (await page.locator(".sheet-summary-text b").innerText()) === "Living room",
  "and the summary leads with the name the user gave it, not the widget type"
);
check(
  /Room · 2×3 · 0, 0/.test(await page.locator(".sheet-summary-text small").innerText()),
  "the meta line is the type, the footprint in cells, and where it sits"
);
check(await page.locator(".sheet-body").count() === 0, "the form is not rendered at peek, so nothing invisible is tabbable");

// The sheet has to stand on the tab bar, not over it and not floating above it.
// --tabbar-h is a hand-kept number and this is what stops it drifting.
{
  const bar = await box(page.locator(".tabbar"));
  const rest = await box(sheet);
  check(Math.abs(rest.y + rest.height - bar.y) <= 1, `the sheet's foot meets the tab bar's head (${Math.round(rest.y + rest.height)} vs ${Math.round(bar.y)})`);
}

// The canvas has to still be reachable: peek's whole point is that the next
// widget is one tap away.
{
  const panel = await box(page.locator(".panel-outer"));
  const rest = await box(sheet);
  check(panel.y + panel.height < rest.y, "the canvas is entirely above the peeking sheet");
}

// peek is the one detent whose height the content decides and --sheet-h only
// claims. The page reserves room from the claim, so a claim that has drifted
// from the measurement either hides the last row or leaves dead space.
{
  const rest = await box(sheet);
  const claimed = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sheet-h"))
  );
  check(
    claimed >= rest.height && claimed - rest.height <= 8,
    `--sheet-h matches what peek actually measures (claims ${claimed}, is ${Math.round(rest.height)})`
  );
}

// ---------- half ----------

await page.locator(".sheet-summary").click();
await page.waitForTimeout(350);
check(await sheet.getAttribute("class").then((c) => c.includes("sheet-half")), "tapping the summary row raises it to half");
check(await page.locator(".sheet-body").count() === 1, "and the form is there");
check(
  await page.locator(".sheet-body .size-picker .chip.active").innerText().then((t) => t.trim() === "2×3"),
  "with the size the widget is actually at marked"
);
check(await page.locator(".sheet-foot .sheet-action").count() === 2, "Duplicate and Delete are in the foot");

// The point of half rather than full: you can still see what you are editing.
// The sheet is 58dvh, so this only holds because raising it also scrolls the
// canvas to the top of the screen.
{
  const panel = await box(page.locator(".panel-outer"));
  const rest = await box(sheet);
  check(panel.y >= 0 && panel.y + panel.height <= rest.y, "the canvas is scrolled into the strip above a half sheet");
  check(
    await page.locator(".panel .widget.selected").isVisible(),
    "so the widget being edited is on screen while its options are"
  );
}

// Every field label styled, not just the ones whose rule happened to be global.
// The inspector's own rules were scoped to .inspector, so in the sheet a plain
// <label> -- which is what the text and select options use -- fell back to an
// unstyled 17px heading between two correctly styled fields.
{
  const unstyled = await page.$$eval(".sheet-body label > span, .sheet-body .field-block > span", (spans) =>
    spans
      .filter((span) => Math.round(parseFloat(getComputedStyle(span).fontSize)) !== 11)
      .map((span) => span.textContent)
  );
  check(unstyled.length === 0, `every field in the sheet is labelled the same way${unstyled.length ? ` (${unstyled.join(", ")} are not)` : ""}`);
}

// The foot must not scroll away with a long option list -- room has nine.
{
  const body = page.locator(".sheet-body");
  await body.evaluate((el) => el.scrollTo(0, 99999));
  await page.waitForTimeout(150);
  const scrolled = await body.evaluate((el) => el.scrollTop > 0);
  check(scrolled, "the form scrolls inside the sheet rather than moving it");
  const foot = await box(page.locator(".sheet-foot"));
  const rest = await box(sheet);
  check(foot.y + foot.height <= rest.y + rest.height + 1, "and Duplicate and Delete stay pinned under it");
  const head = await box(page.locator(".sheet .inspector-head"));
  check(head.y >= rest.y, "the name of the thing being edited stays on screen too");
}

// ---------- full ----------

await page.locator(".sheet-grab").click();
await page.waitForTimeout(350);
check(await sheet.getAttribute("class").then((c) => c.includes("sheet-peek")), "the grabber taps back down to peek");

// Drag it up instead. Two detents in one gesture, which is what the grabber is
// for -- the tap only ever toggles the nearest two.
{
  const grab = await box(page.locator(".sheet-grab"));
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
  await page.mouse.down();
  await page.mouse.move(grab.x + grab.width / 2, grab.y - 60, { steps: 6 });
  await page.waitForTimeout(120);
  // Mid-gesture: the form has to be there already, or the sheet is an empty
  // box growing under the finger and only fills once it is let go.
  check(await page.locator(".sheet-body").count() === 1, "pulling up from peek fills the sheet as it rises, not on release");
  await page.mouse.move(grab.x + grab.width / 2, 60, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  check(await sheet.getAttribute("class").then((c) => c.includes("sheet-full")), "dragging the grabber to the top snaps to full");
}

check(await page.locator(".sheet-scrim").count() === 1, "a full sheet scrims the canvas behind it");
check(
  (await page.locator(".sheet-scrim-hint").innerText()).toLowerCase().includes("dismiss"),
  "and says the strip is tappable"
);
{
  const bar = await box(page.locator(".tabbar"));
  const rest = await box(sheet);
  check(rest.y + rest.height >= bar.y + bar.height - 1, "at full height the sheet covers the tab bar rather than stopping on it");
}

await page.locator(".sheet-scrim").click({ position: { x: 195, y: 40 } });
await page.waitForTimeout(400);
check(await sheet.getAttribute("class").then((c) => c.includes("sheet-peek")), "tapping the scrim comes back to peek, keeping the selection");
check(await page.locator(".sheet-summary").count() === 1, "and the widget is still selected");

// ---------- retracted while dragging ----------

{
  await page.locator(".sheet-summary").click();
  // Long enough for the smooth scroll that brings the canvas up, or the drag
  // below starts on a widget that is still moving.
  await page.waitForTimeout(900);
  const widget = await box(page.locator(".panel .widget").first());
  await page.mouse.move(widget.x + widget.width / 2, widget.y + widget.height / 2);
  await page.mouse.down();
  await page.mouse.move(widget.x + widget.width / 2 + 40, widget.y + widget.height / 2 + 20, { steps: 8 });
  await page.waitForTimeout(150);
  const retracted = await sheet.evaluate((el) => el.className.includes("retracted"));
  check(retracted, "the sheet retracts while a widget is being dragged");
  await page.mouse.up();
  await page.waitForTimeout(400);
  check(
    await sheet.evaluate((el) => !el.className.includes("retracted")),
    "and comes back when the finger lifts"
  );
}

// ---------- the picker still lands on top ----------

{
  await page.locator(".sheet-body .field-block", { hasText: "Room" }).first().locator("button").first().click();
  await page.waitForSelector(".picker", { timeout: 3000 });
  const z = await page.locator(".picker-backdrop").evaluate((el) => Number(getComputedStyle(el).zIndex));
  const sz = await sheet.evaluate((el) => Number(getComputedStyle(el).zIndex));
  check(z > sz, `a picker opened from the sheet lands on top of it (${z} > ${sz})`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check(await page.locator(".picker").count() === 0, "and Escape closes the picker");
  check(await sheet.getAttribute("class").then((c) => c.includes("sheet-half")), "without also collapsing the sheet under it");
}

// ---------- nothing is wider than its window ----------
// Four shipped bugs in this stylesheet have been of exactly this shape, and all
// four were invisible in a static render.

// Driven by asserting where we are rather than by counting taps: a screenshot
// pass that trusted a count once recorded the wrong screen for months.
const toPeek = async () => {
  while (!(await sheet.getAttribute("class")).includes("sheet-peek")) {
    await page.locator(".sheet-grab").click();
    await page.waitForTimeout(350);
  }
};
const dragGrabTo = async (y) => {
  const grab = await box(page.locator(".sheet-grab"));
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
  await page.mouse.down();
  await page.mouse.move(grab.x + grab.width / 2, y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(450);
};

for (const detent of ["peek", "half", "full"]) {
  await toPeek();
  if (detent === "half") await page.locator(".sheet-grab").click();
  if (detent === "full") await dragGrabTo(60);
  await page.waitForTimeout(450);
  check(
    (await sheet.getAttribute("class")).includes(`sheet-${detent}`),
    `the sheet is at ${detent} for the screenshot that says so`
  );
  const spill = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    let worst = null;
    for (const el of document.querySelectorAll("body *")) {
      const box = el.getBoundingClientRect();
      if (box.width === 0) continue;
      const over = Math.round(box.right - width);
      if (over > 1 && (!worst || over > worst.over)) {
        worst = { over, what: el.className || el.tagName };
      }
    }
    return worst;
  });
  check(!spill, `nothing spills past the window at ${detent}${spill ? ` (${spill.what} by ${spill.over}px)` : ""}`);
  await page.screenshot({ path: `/tmp/sheet-${detent}.png` });
}

// ---------- raising the sheet is a movement, not a jump ----------
//
// `height: auto` cannot be transitioned: a sheet whose peek height was `auto`
// snapped open, which reads as a new pane appearing rather than as the one you
// tapped rising. Sheet.jsx measures the row and puts the number back as a real
// length, and this is what says so -- caught part way up rather than asserted
// on the CSS, because the CSS was already declaring a transition that did
// nothing.

// The detent walk above leaves the sheet at full height, covering the canvas
// this needs to click on. Reloaded rather than dismissed: what follows is about
// opening a sheet from cold, and stepping one down from full is not that.
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(".panel .widget", { timeout: 8000 });

await page.locator(".panel .widget").first().click();
await page.waitForSelector(".sheet-peek", { timeout: 3000 });

check(
  /\d/.test(await page.locator(".sheet").evaluate((el) => el.style.height || "")),
  "at peek the sheet carries a measured height rather than auto"
);

{
  const before = await page.locator(".sheet").evaluate((el) => el.getBoundingClientRect().height);
  await page.locator(".sheet-summary").click();
  await page.waitForTimeout(90);
  const during = await page.locator(".sheet").evaluate((el) => el.getBoundingClientRect().height);
  await page.waitForTimeout(500);
  const after = await page.locator(".sheet").evaluate((el) => el.getBoundingClientRect().height);
  check(after > before + 100, "tapping the summary opens the sheet");
  check(
    during > before + 10 && during < after - 30,
    `and it travels to get there (${Math.round(before)} → ${Math.round(during)} → ${Math.round(after)})`
  );
}

// ---------- a big option is a row, and opens a screen ----------
//
// The alternative is what this replaced: every option expanded in one list, so
// a room card's twelve are a scroll of controls nobody is looking at. Which
// options are big enough is wantsScreen() in Inspector.jsx -- the icon list is
// one of them, being every icon the firmware carries.

{
  const rows = page.locator(".option-row");
  const count = await rows.count();
  check(count > 0, `big options are rows rather than controls (${count} of them)`);

  const label = await rows.first().locator(".option-row-label").innerText();
  const value = await rows.first().locator(".option-row-value").innerText();
  check(Boolean(value), `and the row says what it is set to (${label}: ${value})`);

  await rows.first().click();
  await page.waitForTimeout(400);
  check(
    (await page.locator(".sheet .inspector-head h2").innerText()) === label,
    "tapping it opens that option on its own screen"
  );
  check(await page.locator(".option-row").count() === 0, "with the rest of the list out of the way");
  // A list of values is a list of rows on this screen, not the select it is in
  // the field list: a select of three hundred icons cannot be searched, which
  // is the only way to find one among them. Icons are a grid of the drawings
  // rather than rows of their names -- see iconcheck.mjs, which is where that
  // one is held to its shape; here it only has to be *a* control.
  const choices =
    (await page.locator(".option-list [role=option]").count()) +
    (await page.locator(".icon-grid .icon-tile").count());
  check(
    choices > 0 || (await page.locator(".sheet-body textarea, .sheet-body select").count()) > 0,
    `and the control itself on it (${choices} choices)`
  );
  if (choices > 0) {
    check(
      await page.locator(".option-item.selected").count() === 1,
      "with exactly one of them marked as the current value"
    );
  }

  await page.getByRole("button", { name: /^Back to/ }).click();
  await page.waitForTimeout(300);
  check(await page.locator(".option-row").count() === count, "back returns the whole list");

  // Collapsing has to forget it, or the sheet reopens showing one option with
  // no sign that the others exist.
  await rows.first().click();
  await page.waitForTimeout(300);
  await page.locator(".sheet-grab").click();
  await page.waitForTimeout(300);
  await page.locator(".sheet-summary").click();
  await page.waitForTimeout(400);
  check(await page.locator(".option-row").count() === count, "and so does collapsing the sheet");
}

// ---------- the toolbar sheds what the sheet already carries ----------

{
  const onPhone = await page.locator(".pagebar button, .pagebar select").count();
  check(
    await page.locator(".pagebar-actions").count() === 0,
    "the selection actions are off the phone toolbar -- they are in the sheet"
  );
  check(onPhone <= 10, `which leaves it ${onPhone} controls rather than fifteen`);
}

// ---------- and the desktop column is untouched ----------

await page.setViewportSize(DESKTOP);
await page.waitForTimeout(400);
check(await page.locator(".sheet").count() === 0, "widening past the breakpoint puts the options back in their column");
check(
  await page.locator(".pagebar-actions").count() === 1,
  "and the toolbar has its selection actions back, the inspector being a trip away here"
);
check(
  await page.locator(".option-row").count() === 0,
  "with every option expanded again: a column that scrolls has the room for them"
);
check(await page.locator("aside.inspector").count() === 1, "which is the inspector, exactly as it was");
check(
  await page.evaluate(() => !document.documentElement.classList.contains("sheet-open")),
  "and the page stops reserving room for a sheet that is gone"
);
await page.screenshot({ path: "/tmp/sheet-desktop.png", fullPage: false });

console.log(`\n${passes + failures} checks, ${failures ? `${failures} FAILED` : "all sheet checks passed"}`);
await browser.close();
process.exit(failures ? 1 : 0);
