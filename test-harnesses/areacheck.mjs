// WebKit pass over filling a card in from a room.
//
// Picking a room used to be the room card's alone; the climate card now
// declares an `area` option too. What the picker writes is asked of the
// manifest rather than of the widget type: a reading only for an option the
// card declares, the counted list only for a card that publishes a capacity,
// and a name only for a card that has one. The climate card has three
// readings and none of the rest, so picking a room must leave it with exactly
// those -- a stray `entities` or `name` in its options is the failure.
//
// The manifest is the firmware's own (`./sim/preview --manifest`).
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

const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));

const LAYOUT = {
  version: 1,
  rotation: 0,
  pages: [
    {
      id: "p1",
      name: "Home",
      chip_row: "bottom",
      queued: true,
      widgets: [
        { id: "c1", type: "climate", size: "2x1", x: 41, y: 29, options: { icon: "rooms_bed" } },
        { id: "r1", type: "room", size: "2x2", x: 535, y: 29, options: {} },
      ],
    },
  ],
};

// Ranked as the backend ranks them. The bedroom has a sensor for the
// temperature, and the study only a thermostat -- whose own reading is then the
// room's, which the firmware reads from its current_temperature.
const AREAS = [
  {
    id: "bed",
    name: "Bedroom",
    entities: [
      { entity_id: "climate.bedroom", name: "Bedroom radiator", domain: "climate", device_class: "" },
      { entity_id: "sensor.bed_temp", name: "Bedroom temperature", domain: "sensor", device_class: "temperature" },
      { entity_id: "sensor.bed_hum", name: "Bedroom humidity", domain: "sensor", device_class: "humidity" },
      { entity_id: "sensor.bed_co2", name: "Bedroom CO2", domain: "sensor", device_class: "carbon_dioxide" },
      { entity_id: "light.bed", name: "Bedside lamp", domain: "light", device_class: "" },
    ],
  },
  {
    id: "study",
    name: "Study",
    entities: [
      { entity_id: "climate.study", name: "Study radiator", domain: "climate", device_class: "" },
      { entity_id: "light.desk", name: "Desk lamp", domain: "light", device_class: "" },
    ],
  },
];

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (error) => console.log("PAGEERROR: " + error.message));
let saved = LAYOUT;
let writes = 0;

await page.route("**/api/**", async (route) => {
  const request = route.request();
  const url = request.url();
  const json = (body) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  if (/\/layout(\?|$)/.test(url) && request.method() !== "GET") {
    saved = JSON.parse(request.postData() || "{}");
    writes++;
    return json({ ok: true });
  }
  if (/\/panels\b/.test(url)) {
    return json({
      panels: [{ id: "inkplate-057090", name: "Hallway", model: "inkplate5v2", online: true, width: 1280, height: 720, has_manifest: true }],
      default: "inkplate-057090",
    });
  }
  if (/\/status(\?|$)/.test(url)) {
    return json({ online: true, manifest, current_page: "p1", page_locked: false, last_seen: Date.now() / 1000, settings: {} });
  }
  if (/\/layout(\?|$)/.test(url)) return json(saved);
  if (/\/areas(\?|$)/.test(url)) return json(AREAS);
  if (/\/entities(\?|$)/.test(url)) return json(AREAS.flatMap((area) => area.entities));
  if (/\/devices(\?|$)/.test(url)) return json([]);
  if (/\/images(\?|$)/.test(url)) return json({ images: [], base_url: "", device: { have: [] } });
  if (/\/albums(\?|$)/.test(url)) return json({ albums: [], refresh: {} });
  if (/\/history(\?|$)/.test(url)) return json({ history: [] });
  return json({});
});

await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
await page.waitForSelector(".panel .widget", { timeout: 5000 });

const options = (id) => saved.pages[0].widgets.find((one) => one.id === id).options;

// Picks `room` for the widget at `index`, and waits for the layout to be saved.
const pickRoom = async (index, room) => {
  await page.locator(".panel .widget").nth(index).click();
  await page.waitForTimeout(300);
  const before = writes;
  await page.locator(".entity-trigger", { hasText: /Choose room|Bedroom|Study/ }).first().click();
  await page.locator(".picker-tile", { hasText: room }).first().click();
  for (let i = 0; i < 50 && writes === before; i++) await page.waitForTimeout(100);
  return writes > before;
};

console.log("--- the climate card ---");
check(await pickRoom(0, "Bedroom"), "picking a room on the climate card saves the layout");
{
  const o = options("c1");
  check(o.area === "bed", "it keeps the room's id");
  check(o.temperature === "climate.bedroom", `the thermostat is the temperature, as on the room card (${o.temperature})`);
  check(o.humidity === "sensor.bed_hum", `the humidity sensor is the humidity (${o.humidity})`);
  check(o.climate === "climate.bedroom", `the radiator is the radiator (${o.climate})`);
  check(!("entities" in o), "no counted list: the climate card draws none");
  check(!("name" in o) && !("areaName" in o), "no name: the climate card has none");
  check(!("pm25" in o) && !("co2" in o), "no air quality: the climate card declares none");
  check(o.icon === "rooms_bed", "and the icon it already had is left alone");
}
check((await page.locator(".option-row-label", { hasText: "Things in the room" }).count()) === 0 &&
      (await page.getByText("Things in the room").count()) === 0,
      "the editor offers no list of things in the room for it");
check(!/shown/.test(await page.locator(".entity-trigger", { hasText: "Bedroom" }).first().innerText()),
      "and the room row does not count entities it is not showing");

check(await pickRoom(0, "Study"), "picking another room saves again");
{
  const o = options("c1");
  check(o.area === "study" && o.temperature === "climate.study" && o.climate === "climate.study",
        "a thermostat-only room gives the thermostat both jobs");
  check(o.humidity === "", `and clears the humidity the last room filled (${JSON.stringify(o.humidity)})`);
}

console.log("--- the room card, unchanged ---");
check(await pickRoom(1, "Bedroom"), "picking a room on the room card saves the layout");
{
  const o = options("r1");
  check(o.temperature === "climate.bedroom" && o.humidity === "sensor.bed_hum" &&
        o.co2 === "sensor.bed_co2" && o.climate === "climate.bedroom",
        "its band is filled in as before");
  check(JSON.stringify(o.entities) === JSON.stringify(["sensor.bed_temp", "light.bed"]),
        `its counted list is what the band did not take (${JSON.stringify(o.entities)})`);
  check(o.name === "Bedroom", "and it is named after the room");
}

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
