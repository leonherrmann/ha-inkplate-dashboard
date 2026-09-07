import { useState } from "react";

// Choosing how big a picture should be, by pointing at the space it will take.
//
// This was two rows of chips -- "1 wide 2 wide 3 wide 4 wide 5 wide" then "1
// tall 2 tall 3 tall" -- which asks for a footprint as two separate numbers and
// pictures neither. The panel is a 5x3 grid, so the honest control is the grid
// itself: sweep out the rectangle you want, the way a spreadsheet asks for a
// table size.
//
// Hovering previews, clicking commits. On a touchscreen there is no hover, so a
// tap does both -- which is why the preview state is only ever an overlay on
// the committed one and never replaces it.

export default function GridSizePicker({ grid, cols, rows, onChange, disabled }) {
  const [preview, setPreview] = useState(null);

  const shown = preview || { cols, rows };
  const cells = [];

  for (let row = 1; row <= grid.rows; row += 1) {
    for (let col = 1; col <= grid.cols; col += 1) {
      const inside = col <= shown.cols && row <= shown.rows;
      cells.push(
        <button
          key={`${col}x${row}`}
          type="button"
          disabled={disabled}
          className={inside ? "grid-cell on" : "grid-cell"}
          // Announced as a size rather than as a coordinate: "3 by 2" is the
          // thing being chosen, where "column 3 row 2" is how it is drawn.
          aria-label={`${col} by ${row}`}
          aria-pressed={col === cols && row === rows}
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") setPreview({ cols: col, rows: row });
          }}
          onFocus={() => setPreview({ cols: col, rows: row })}
          onClick={() => {
            setPreview(null);
            onChange(col, row);
          }}
        />
      );
    }
  }

  return (
    <div
      className="grid-size"
      onPointerLeave={() => setPreview(null)}
      onBlur={() => setPreview(null)}
    >
      <div
        className="grid-size-cells"
        style={{ gridTemplateColumns: `repeat(${grid.cols}, 1fr)` }}
        role="group"
        aria-label="Size on the panel"
      >
        {cells}
      </div>
      <div className="grid-size-read">
        <b>
          {shown.cols} × {shown.rows}
        </b>
        <small>
          {shown.cols * grid.unit_w + (shown.cols - 1) * grid.gap} ×{" "}
          {shown.rows * grid.unit_h + (shown.rows - 1) * grid.gap} px
        </small>
      </div>
    </div>
  );
}
