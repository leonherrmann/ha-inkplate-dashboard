// Does the editor snap where the firmware draws?
//
// The editor never sees Grid.h. It reproduces those origins from the gaps and
// margins the manifest publishes, in JavaScript, and "reads plausible" is not a
// check -- a cell origin one gap out puts every card on the page in the wrong
// place, and the only way anyone finds out is by looking at the panel.
//
// So this puts the two side by side. `sim/host/GridDump.cpp` prints the
// firmware's own origins for every shape and every chip row; this drives
// layout.js from the matching manifest and asserts they are the same numbers.
// Four shapes (two panels, two ways up) x three chip row settings, every column
// and every row, plus the snapping, clamping and placement built on top.
//
//     cd ha_dashboard/ha_dashboard
//     clang++ -std=c++17 -o /tmp/griddump-v2 sim/host/GridDump.cpp
//     clang++ -std=c++17 -DARDUINO_INKPLATE5 -o /tmp/griddump-v1 sim/host/GridDump.cpp
//     /tmp/griddump-v2 > /tmp/grid-v2.json && /tmp/griddump-v1 > /tmp/grid-v1.json
//     ./sim/preview --manifest --orientation 0 > /tmp/manifest-v2-0.json   (etc)
//     node ../../test-harnesses/snapcheck.mjs
import { readFileSync } from "node:fs";

const SRC = "/Users/leon/Documents/Ich/Development/Arduino/inkplate5v2/ha-inkplate-dashboard/dashboard/frontend/src/";
const {
  FALLBACK_GRID, PORTRAIT, LANDSCAPE,
  shapeGrid, shapePanel, shapeFromOrientation, pageGrid,
  cardBandTop, chipRowTop, gridOrigin, gridPitch, axisOrigin, snapValue,
  placeWidget, placeChipX, defaultPosition, boxOn, nearestVariant, variantFootprint,
  widgetSize, marginX, otherChips,
} = await import(SRC + "layout.js");

let passes = 0;
let failures = 0;
const fails = [];
const check = (ok, what) => {
  if (ok) passes += 1;
  else {
    failures += 1;
    fails.push(what);
    console.log("FAIL " + what);
  }
};
const eq = (got, want, what) => check(got === want, `${what} (got ${got}, firmware says ${want})`);

const CHIP_ROWS = ["top", "bottom", "off"];

for (const panel of ["v2", "v1"]) {
  const truth = JSON.parse(readFileSync(`/tmp/grid-${panel}.json`, "utf8"));

  for (const degrees of [0, 90, 180, 270]) {
   for (const publishedAt of [0, 90, 180, 270]) {
    // The manifest the panel actually sent, which describes the shape it is
    // standing in -- not necessarily the shape being edited. Every combination,
    // because the editor offers both arrangements whichever way the panel is up,
    // and the published widths are only right for one of them.
    const manifest = JSON.parse(readFileSync(`/tmp/manifest-${panel}-${publishedAt}.json`, "utf8"));
    const want = truth[String(degrees)];
    const shape = shapeFromOrientation(degrees);

    // What the editor works from: the shape's block off the manifest, over the
    // fallback, exactly as App.jsx builds it.
    const deviceGrid = { ...FALLBACK_GRID, ...shapeGrid(manifest, shape) };
    const box = shapePanel(manifest, shape);
    const where = `${truth.model} at ${degrees} (manifest sent at ${publishedAt})`;

    if (degrees === publishedAt) {
      console.log(`\n--- ${truth.model} at ${degrees}: ${want.panel[0]}x${want.panel[1]}, ${want.cols}x${want.rows} ---`);
    }

    eq(box.width, want.panel[0], `${where}: the panel is this wide`);
    eq(box.height, want.panel[1], `${where}: and this tall`);
    eq(deviceGrid.cols, want.cols, `${where}: columns`);
    eq(deviceGrid.rows, want.rows, `${where}: rows`);
    eq(deviceGrid.chip_h, want.chip_h, `${where}: the chip row is this tall`);

    // Spans: a widget of n cells is this many pixels, gaps included.
    for (let cols = 1; cols <= want.cols; cols += 1) {
      const [w] = boxOn(deviceGrid, cols, 1, "bottom");
      eq(w, want.span_w[cols - 1], `${where}: a ${cols}-wide widget`);
    }

    for (const chipRow of CHIP_ROWS) {
      const grid = pageGrid(deviceGrid, chipRow);
      const wantRow = want.chip_rows[chipRow];
      const at = `${where}, chip row ${chipRow}`;

      eq(cardBandTop(grid, chipRow), wantRow.card_band_top, `${at}: the cards start here`);

      for (let rows = 1; rows <= want.rows; rows += 1) {
        const [, h] = boxOn(grid, 1, rows, chipRow);
        eq(h, wantRow.span_h[rows - 1], `${at}: a ${rows}-tall widget`);
      }

      // Every column and every row, which is the whole point.
      for (let col = 0; col < want.cols; col += 1) {
        eq(gridOrigin(grid, "x", col, chipRow), want.col_x[col], `${at}: column ${col}`);
      }
      for (let row = 0; row < want.rows; row += 1) {
        eq(gridOrigin(grid, "y", row, chipRow), wantRow.row_y[row], `${at}: row ${row}`);
      }

      if (chipRow !== "off") {
        eq(chipRowTop(grid, box, chipRow), wantRow.chip_row_y, `${at}: the chip row sits here`);
      }

      // Snapping: a card dropped anywhere in a cell lands on that cell. Pitch/3
      // either side of each origin is well inside the cell and well away from
      // the next one.
      const pitchX = gridPitch(grid, "x");
      const pitchY = gridPitch(grid, "y");
      let snappedRight = true;
      for (let col = 0; col < want.cols; col += 1) {
        for (const nudge of [-Math.floor(pitchX / 3), 0, Math.floor(pitchX / 3)]) {
          if (snapValue(want.col_x[col] + nudge, "x", "grid", grid, chipRow) !== want.col_x[col]) {
            snappedRight = false;
          }
        }
      }
      check(snappedRight, `${at}: a card dropped near a column snaps onto it`);

      let snappedDown = true;
      for (let row = 0; row < want.rows; row += 1) {
        for (const nudge of [-Math.floor(pitchY / 3), 0, Math.floor(pitchY / 3)]) {
          if (snapValue(wantRow.row_y[row] + nudge, "y", "grid", grid, chipRow) !== wantRow.row_y[row]) {
            snappedDown = false;
          }
        }
      }
      check(snappedDown, `${at}: and dropped near a row snaps onto it`);

      // Dragging hard into the far corner: a widget must stop on the last cell
      // that leaves it wholly on the glass, never past it.
      for (const [cols, rows] of [[1, 1], [2, 1], [1, 2], [2, 2]]) {
        if (cols > want.cols || rows > want.rows) continue;
        const [width, height] = boxOn(grid, cols, rows, chipRow);
        const placed = placeWidget(
          { x: 0, y: 0 },
          { x: 99999, y: 99999 },
          "grid",
          grid,
          { width, height },
          box,
          { chipRow }
        );
        const lastCol = want.col_x[want.cols - cols];
        const lastRow = wantRow.row_y[want.rows - rows];
        eq(placed.x, lastCol, `${at}: a ${cols}x${rows} dragged right stops on the last column that fits`);
        eq(placed.y, lastRow, `${at}: a ${cols}x${rows} dragged down stops on the last row that fits`);
        check(
          placed.x + width <= want.panel[0] && placed.y + height <= want.panel[1],
          `${at}: and a ${cols}x${rows} in the corner is wholly on the glass`
        );
      }

      // And into the near corner.
      const [w1, h1] = boxOn(grid, 1, 1, chipRow);
      const near = placeWidget({ x: 0, y: 0 }, { x: -99999, y: -99999 }, "grid", grid,
                               { width: w1, height: h1 }, box, { chipRow });
      eq(near.x, want.col_x[0], `${at}: dragged left it stops on the first column`);
      eq(near.y, wantRow.row_y[0], `${at}: dragged up it stops on the first row`);

      // A new card starts on a real cell.
      const home = defaultPosition(grid, { chipRow, panel: box });
      eq(home.x, want.col_x[0], `${at}: a new card starts on the first column`);
      eq(home.y, wantRow.row_y[0], `${at}: and on the first row`);

      if (chipRow === "off") continue;

      // Chips. They are free to the pixel horizontally, but they sit in the row
      // and stay inside the margins.
      const chipHome = defaultPosition(grid, { chipRow, isChip: true, panel: box });
      eq(chipHome.y, wantRow.chip_row_y, `${at}: a new chip starts in the chip row`);
      eq(chipHome.x, want.margin_x, `${at}: at the margin`);

      const dragged = placeWidget({ x: 0, y: 0 }, { x: 99999, y: 0 }, "grid", grid,
                                  { width: 120, height: want.chip_h }, box,
                                  { chipRow, isChip: true, others: [] });
      eq(dragged.y, wantRow.chip_row_y, `${at}: a dragged chip stays in the row`);
      eq(
        dragged.x,
        want.panel[0] - want.margin_x - 120,
        `${at}: and stops a margin short of the right edge`
      );

      const left = placeChipX(-500, 120, [], grid, box);
      eq(left, want.margin_x, `${at}: pushed left it stops at the margin`);

      // Two chips cannot be put on the same pixel.
      const other = { x: want.margin_x, width: 120 };
      const beside = placeChipX(want.margin_x + 10, 120, [other], grid, box);
      check(
        beside >= other.x + other.width + want.gap_x || beside + 120 + want.gap_x <= other.x,
        `${at}: a chip dropped on another keeps a gap from it (${beside})`
      );
    }

    // A card's drawn footprint is this shape's cells, not the ones the panel
    // happened to publish. A 2x1 is 457 wide upright and 442 on its side, so
    // taking the published width for both drew every multi-cell card 15px wide
    // of its cells -- which is what "the portrait grid does not snap right"
    // looks like from the outside.
    const chipRowsGrid = pageGrid(deviceGrid, "bottom");
    for (const type of manifest.widgets || []) {
      for (const variant of type.sizes || []) {
        if (!variant.cols || !variant.rows) continue;
        if (variant.cols > want.cols || variant.rows > want.rows) continue;
        const [wantW, wantH] = boxOn(chipRowsGrid, variant.cols, variant.rows, "bottom");
        const got = widgetSize(
          manifest, { type: type.type, size: variant.id, options: {} }, [], "bottom", chipRowsGrid
        );
        eq(got.width, wantW, `${where}: ${type.type} ${variant.id} is drawn this wide`);
        eq(got.height, wantH, `${where}: ${type.type} ${variant.id} is drawn this tall`);
      }
    }

    // A chip is as tall as the row of the shape it is in.
    const chipType = (manifest.widgets || []).find((one) => one.chip);
    if (chipType) {
      const chip = widgetSize(
        manifest, { type: chipType.type, options: {} }, [], "bottom", chipRowsGrid
      );
      eq(chip.height, want.chip_h, `${where}: a chip is as tall as this shape's row`);
    }

    // Resizing: the variant a dragged box is nearest must be judged against
    // *this* shape's cells, not the published ones.
    const type = (manifest.widgets || []).find((one) => (one.sizes || []).length > 1 && !one.chip);
    if (type) {
      for (const variant of type.sizes) {
        if (!variant.cols || !variant.rows) continue;
        if (variant.cols > want.cols || variant.rows > want.rows) continue;
        const [width, height] = boxOn(deviceGrid, variant.cols, variant.rows, "bottom");
        const picked = nearestVariant(type, { width, height }, "bottom", deviceGrid);
        eq(
          picked?.id,
          variant.id,
          `${where}: a box the size of ${type.id} ${variant.id} resizes to ${variant.id}`
        );
      }
    }
   }
  }
}

console.log(`\n${passes + failures} checks, ` + (failures ? `${failures} FAILED` : "the editor snaps where the firmware draws"));
if (failures) {
  console.log("\nFirst failures:");
  for (const line of fails.slice(0, 12)) console.log("  " + line);
}
process.exit(failures ? 1 : 0);
