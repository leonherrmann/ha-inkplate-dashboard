// WebKit pass for the banner that shows settings changed on the panel itself.
//
// WebKit rather than Chromium for the usual reason on this project: every
// editor bug reported here has been Safari-only.
//
// What it has to prove is mostly about absence. The banner is a fault report --
// the panel and the layout disagreeing -- and the normal state is that they
// agree, so a banner that showed when there was nothing to say would be on
// screen permanently and stop meaning anything.
//
//   cd ha-inkplate-dashboard/dashboard/frontend && npx serve dist -l 8127
//   node ../../test-harnesses/device-overrides.mjs
import { webkit } from "playwright";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("./manifest-images.json", import.meta.url), "utf8"));
const NOW = Math.floor(Date.now() / 1000);
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "  ok  " : "  FAIL"}  ${what}`); if (!ok) failures++; };

const layout = { version:5, grid_generation:2, orientation:0,
  sleep:{enabled:false,start:"23:00",end:"06:00",wake_minutes:30},
  rotation:{enabled:false,default_dwell_seconds:60}, refresh:{ghost_percent:12},
  pages:[{id:"main",name:"Main",queued:true,dwell_seconds:0,chip_row:"bottom",widgets:[]},
         {id:"kitchen",name:"Kitchen",queued:true,dwell_seconds:0,chip_row:"bottom",widgets:[]}] };

const open = async (browser, overrides) => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname.split("/api/")[1];
    if (route.request().method() === "POST") return route.fulfill({ json: { ok: true } });
    const body = {
      status: { device_id:"inkplate5v2", online:true, manifest, applied:5, stats:{}, charging:false,
        current_page:"main", last_seen:NOW, server_time:NOW, draft_version:5, pushed_version:5,
        draft_pushed:true, bridge_enabled:true, device_overrides: overrides },
      layout, entities:[], devices:[], areas:[],
      panels: { panels: [{ id:"inkplate-a864a0", name:"Kitchen", model:"inkplate5v2", online:true,
        width:1280, height:720, has_manifest:true }], default:"inkplate-a864a0" },
      images:{images:[],base_url:"http://x:8098",device:{},device_reports:false},
      history:{samples:[]}, firmware:{running:"v2026.9.20",offered:null},
      screenshot:{held:false}, logs:{text:"",bytes:0,received_at:null},
    }[path];
    return route.fulfill({ json: body === undefined ? {} : body });
  });

  await page.goto(process.env.BASE || "http://127.0.0.1:8127/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Display", exact: true }).click().catch(() => {});
  await page.waitForTimeout(300);
  return { page, errors };
};

const run = async () => {
  const browser = await webkit.launch();

  {
    // The normal state, and by far the most common: nothing overridden.
    const { page, errors } = await open(browser, {});
    const banner = page.locator(".note.danger");
    check(await banner.count() === 0, "no notice when the panel agrees with the layout");
    check(await page.getByText("Orientation").count() > 0, "the orientation control is there");
    check(errors.length === 0, `no console errors (${errors.join(" | ")})`);
    await page.close();
  }

  {
    // ...and the same when the key is missing entirely, which is what an
    // add-on talking to a firmware from before this feature will see.
    const { page } = await open(browser, undefined);
    check(await page.locator(".note.danger").count() === 0,
      "and none when the device never sends the key at all");
    await page.close();
  }

  {
    const { page, errors } = await open(browser, { orientation: 180 });
    const banner = page.locator(".note.danger");
    check(await banner.count() === 1, "a notice when the panel was turned over");
    const words = await banner.innerText();
    check(/Upside down/.test(words), "naming the orientation as the editor names it");
    check(/Push mine/.test(words) && /Adopt/.test(words), "and offering both ways to end it");
    check(errors.length === 0, `no console errors (${errors.join(" | ")})`);
    await page.close();
  }

  {
    const { page } = await open(browser, { ghost_percent: 25, sleep_enabled: true });
    const words = await page.locator(".note.danger").innerText();
    check(/screen refresh 25 %/.test(words), "the refresh setting is named with its value");
    check(/night sleep on/.test(words), "and night sleep is spelled out");
    await page.close();
  }

  {
    // A percentage set through the API rather than chosen from the four. Shown
    // as it is rather than snapped to a neighbour, which is what the editor's
    // own control does with the same value.
    const { page } = await open(browser, { ghost_percent: 37 });
    const words = await page.locator(".note.danger").innerText();
    check(/37 %/.test(words), "an unrecognised percentage is shown as itself");
    await page.close();
  }

  {
    const { page } = await open(browser, { pages: { kitchen: false, main: true } });
    const words = await page.locator(".note.danger").innerText();
    check(/kitchen/.test(words), "a page turned off on the panel is named");
    check(!/main/.test(words), "and a page left on is not, because nothing is wrong with it");
    await page.close();
  }

  {
    // Every page override still on. There is nothing to report, so there must
    // be no banner -- an empty "Pages turned off:" would be worse than silence.
    const { page } = await open(browser, { pages: { kitchen: true } });
    check(await page.locator(".note.danger").count() === 0,
      "no notice when the only page override agrees with the layout");
    await page.close();
  }

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : "\nall device override checks passed");
  process.exit(failures ? 1 : 0);
};

run();
