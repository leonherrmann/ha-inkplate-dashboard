"""What shape a panel's grid is.

The firmware is the authority on this and publishes it in every manifest: gap,
cell size, how many columns and rows, and the panel's own pixels. Nothing here
decides any of it -- this module is only the place that *asks*, so that the half
dozen callers that need to know a widget's pixel footprint do not each dig
through a manifest and each handle its absence differently.

It matters now because the numbers are no longer one set. An Inkplate 5 V2 is
5x3 cells of 220x166 on 1280x720; a V1 is 4x2 of 215x194 on 960x540. A photo
rendered for one is the wrong size for the other, and a canvas drawn to one puts
the other's widgets in the wrong place.

The fallback is the V2's grid, and it is a real fallback rather than a default:
album refreshes run on a timer and have to work when no panel has ever
connected, and a panel that has never sent a manifest is far more likely to be
the V2 this add-on was written for than anything else. A wrong guess costs
pictures rendered at the wrong size, which the next refresh after the manifest
arrives puts right.
"""

from __future__ import annotations

from typing import Any, NamedTuple

import manifest_store


class Grid(NamedTuple):
    gap: int         # the horizontal one, kept for callers that want just "the gap"
    unit_w: int
    unit_h: int      # a page with a chip row
    unit_h_off: int  # a page without one -- the same number since the shared cell
    cols: int
    rows: int
    width: int
    height: int
    chip_h: int
    # The two axes are not quite the same, and neither is the margin at the
    # panel's edge. One cell of 210x172 is used on both panels and both ways up,
    # and no cell that size divides 1280, 720, 960 and 540 exactly -- so each
    # shape keeps its own gap and lets the leftover sit in the margin. Within a
    # shape the two gaps are within a few pixels of each other and read as one.
    gap_x: int = 0
    gap_y: int = 0
    margin_x: int = 0
    margin_y: int = 0
    # 0, 90, 180 or 270, as the person looking at the panel would say it. The
    # width and height above are already the turned ones; this is here so the
    # editor can say which way up it is.
    orientation: int = 0

    def box(self, cols: int, rows: int, chip_row: str) -> tuple[int, int]:
        """A widget's pixel footprint, the same arithmetic Grid.h does."""
        unit_h = self.unit_h_off if chip_row == "off" else self.unit_h
        return (
            cols * self.unit_w + (cols - 1) * self.gap_x,
            rows * unit_h + (rows - 1) * self.gap_y,
        )

    def as_laid_out_for(self) -> dict[str, int]:
        """This grid in the shape the firmware reads back out of a layout.

        A layout is a list of pixel positions, and pixels only mean something
        against the grid they were placed on. The firmware reads this under
        `laid_out_for`, and a layout that does not carry it is assumed to have
        been drawn for the V2 -- which was true of every layout that existed
        before there were two panels, and is wrong for every layout drawn for
        an Inkplate 5 since.

        What that cost: the V1 re-mapped its *own* layout as though it were the
        V2's, scaling every position across the difference between the panels.
        Cards survived it, because they are re-placed by cell and land back on
        the cell they came from. Chips are positioned to the pixel, so a chip
        put against the right-hand margin in the editor arrived a quarter of
        the panel short of it.

        The manifest's own key names, so the two sides have nothing to agree
        about beyond the spelling the firmware already publishes.
        """
        return {
            "width": self.width,
            "height": self.height,
            "gap": self.gap,
            "gap_x": self.gap_x,
            "gap_y": self.gap_y,
            "margin_x": self.margin_x,
            "margin_y": self.margin_y,
            "unit_w": self.unit_w,
            "unit_h": self.unit_h,
            "unit_h_off": self.unit_h_off,
            "chip_h": self.chip_h,
            "orientation": self.orientation,
        }

    @property
    def full_screen_box(self) -> tuple[int, int]:
        """The full-screen box, chip row off.

        The one grid box the firmware's PhotoCard lets run to the physical
        edges instead of insetting into it.
        """
        return self.box(self.cols, self.rows, "off")


# The Inkplate 5 V2, which is the panel this add-on was written for.
V2 = Grid(
    gap=37,
    unit_w=210,
    unit_h=172,
    unit_h_off=172,
    cols=5,
    rows=3,
    width=1280,
    height=720,
    chip_h=56,
    gap_x=37,
    gap_y=30,
    margin_x=41,
    margin_y=29,
    orientation=0,
)


def from_manifest(manifest: dict[str, Any] | None) -> Grid:
    """The grid a manifest describes, filling anything missing from the V2's.

    Field by field rather than all-or-nothing: an older firmware publishes a
    grid without `chip_h`, and losing the four numbers it did send because of
    the one it did not would be worse than assuming that one.
    """
    if not manifest:
        return V2

    grid = manifest.get("grid") or {}
    display = manifest.get("display") or {}

    def number(source: dict[str, Any], key: str, fallback: int) -> int:
        value = source.get(key)
        return int(value) if isinstance(value, (int, float)) and value > 0 else fallback

    gap_x = number(grid, "gap_x", number(grid, "gap", V2.gap_x))
    return Grid(
        gap=number(grid, "gap", V2.gap),
        unit_w=number(grid, "unit_w", V2.unit_w),
        unit_h=number(grid, "unit_h", V2.unit_h),
        unit_h_off=number(grid, "unit_h_off", V2.unit_h_off),
        cols=number(grid, "cols", V2.cols),
        rows=number(grid, "rows", V2.rows),
        width=number(display, "width", V2.width),
        height=number(display, "height", V2.height),
        chip_h=number(grid, "chip_h", V2.chip_h),
        # Firmware older than the per-axis split publishes one `gap` and no
        # margin at all, and on that firmware the margin *was* the gap -- so
        # falling back that way describes those panels exactly.
        gap_x=gap_x,
        gap_y=number(grid, "gap_y", gap_x),
        margin_x=number(grid, "margin_x", gap_x),
        margin_y=number(grid, "margin_y", number(grid, "gap_y", gap_x)),
        orientation=int((display.get("orientation") or 0)),
    )


def of(panel_id: str | None) -> Grid:
    """The grid of the panel with this id."""
    return from_manifest(manifest_store.load(panel_id) if panel_id else None)
