import WidgetPreview from "./WidgetPreview.jsx";
import { DEFAULT_CHIP_ROW, hasChipRow, widgetSize } from "./layout.js";

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

export default function PageThumb({ page, manifest, uploads, panel, width = 120 }) {
  const scale = width / panel.width;
  const height = Math.round(panel.height * scale);
  const widgets = page.widgets || [];
  const chipRow = page.chip_row || DEFAULT_CHIP_ROW;

  if (!manifest || widgets.length === 0) {
    return (
      <div className="page-thumb" style={{ width, height }}>
        {page.name || page.id}
      </div>
    );
  }

  return (
    <div className="page-thumb" style={{ width, height }}>
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
          const size = widgetSize(manifest, widget, uploads, chipRow);
          return (
            <div
              key={widget.id}
              style={{ position: "absolute", left: widget.x, top: widget.y, ...size }}
            >
              <WidgetPreview
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
