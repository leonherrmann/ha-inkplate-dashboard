import WidgetPreview from "./WidgetPreview.jsx";
import {
  DEFAULT_CHIP_ROW,
  FALLBACK_GRID,
  LANDSCAPE,
  arrangementFor,
  pageGrid,
  shapeGrid,
  hasChipRow,
  panelModel,
  shapeOrientation,
  widgetSize,
} from "./layout.js";

// A page at thumbnail size, drawn from the same previews the canvas uses.
//
// Real content rather than a name in a box: on the Pages screen the rows are
// told apart by the shape of what is on them long before the name is read. It
// is the canvas with everything interactive taken out -- no dnd context, no
// selection, no grid -- because none of that survives being 9% of its size.
//
// Falls back to the page's name when there is no manifest, since widget
// footprints come from it and a thumbnail of guessed sizes would be a
// misleading picture rather than an absent one.
//
// It pictures *a shape*, and has to be told which. It used to be given the box
// of the shape being edited and then draw `page.widgets` into it regardless --
// so with the sideways arrangement open, every thumbnail was a portrait box
// holding the upright arrangement, at landscape pixel positions against a
// 720-wide panel. Cards sat off the right-hand edge and the two orientations
// looked swapped.

export default function PageThumb({ page, manifest, uploads, panel, shape = LANDSCAPE, width = 120 }) {
  // The long side, so a row is the same height whichever shape is being shown
  // and a portrait thumbnail is not nearly twice the size of a landscape one.
  const scale = width / Math.max(panel.width, panel.height);
  const box = { width: Math.round(panel.width * scale), height: Math.round(panel.height * scale) };
  const widgets = arrangementFor(page, shape, manifest);
  const chipRow = page.chip_row || DEFAULT_CHIP_ROW;
  // This shape's own grid: a card's footprint is derived from the cells it
  // covers, and the two shapes do not share a gap, so the published sizes are
  // only right for one of them.
  const grid = pageGrid({ ...FALLBACK_GRID, ...shapeGrid(manifest, shape) }, chipRow);

  if (!manifest || widgets.length === 0) {
    return (
      <div className="page-thumb" style={box}>
        {page.name || page.id}
      </div>
    );
  }

  return (
    <div className="page-thumb" style={box}>
      <div
        className="panel"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: panel.width,
          height: panel.height,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          backgroundImage: "none",
        }}
        aria-hidden="true"
      >
        {widgets.map((widget) => {
          const size = widgetSize(manifest, widget, uploads, chipRow, grid);
          return (
            <div
              key={widget.id}
              style={{ position: "absolute", left: widget.x, top: widget.y, ...size }}
            >
              <WidgetPreview
                model={panelModel(manifest)}
                orientation={shapeOrientation(shape)}
                type={widget.type}
                options={widget.options}
                size={size}
                uploads={uploads}
                sizeId={widget.size}
                tall={!hasChipRow(chipRow)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
