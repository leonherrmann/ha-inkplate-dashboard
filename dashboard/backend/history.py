"""Voltage and availability history, and the charging state derived from it.

The device reports voltage but cannot tell whether it is charging: it has no
charge-detect pin, and after a deep sleep its RAM is gone, so it cannot remember
what the voltage was an hour ago. The add-on can, so charging is worked out here
from the trend and published back for the device to draw.

The catch, stated plainly because it affects how the result reads: a lithium
cell's voltage climbs while charging but flattens near full, so a fully charged
device on the cable eventually looks "not charging". The trend is evidence, not
a measurement.
"""

import json
import logging
import os
import time
from typing import Any

from settings import CHARGE_THRESHOLD_V, CHARGE_WINDOW_MINUTES, DATA_DIR

log = logging.getLogger(__name__)

# One file per panel. Voltage and availability are facts about a particular
# panel, and a shared file would have drawn one sparkline out of two batteries.
# The file a single-panel install left behind is adopted by the first panel to
# record a sample, so an existing week of history is not thrown away.
LEGACY_HISTORY_PATH = os.path.join(DATA_DIR, "history.json")


def history_path(panel_id: str) -> str:
    return os.path.join(DATA_DIR, f"history-{panel_id}.json")

# One sample per quarter hour for a week: enough to see a discharge curve and
# any nightly dropouts, small enough to keep as plain JSON.
SAMPLE_SECONDS = 15 * 60
RETENTION_SECONDS = 7 * 24 * 3600

# A trend needs a time base. Without this, a couple of samples seconds apart
# could swing the answer on noise alone, and a just-started add-on would claim
# to know something it does not.
MIN_EVIDENCE_SECONDS = 5 * 60


class History:
    def __init__(self) -> None:
        # Per panel, keyed by id, loaded lazily.
        self._samples: dict[str, list[dict[str, Any]]] = {}

    # -- storage -----------------------------------------------------------

    def _load(self, panel_id: str) -> list[dict[str, Any]]:
        held = self._samples.get(panel_id)
        if held is not None:
            return held

        samples: list[dict[str, Any]] = []
        for candidate in (history_path(panel_id), LEGACY_HISTORY_PATH):
            try:
                with open(candidate, "r", encoding="utf-8") as handle:
                    samples = json.load(handle)
                break
            except FileNotFoundError:
                continue
            except (json.JSONDecodeError, OSError) as error:
                log.warning("Could not read history (%s), starting fresh", error)
                break

        self._samples[panel_id] = samples
        return samples

    def _save(self, panel_id: str) -> None:
        os.makedirs(DATA_DIR, exist_ok=True)
        try:
            with open(history_path(panel_id), "w", encoding="utf-8") as handle:
                json.dump(self._samples.get(panel_id, []), handle)
        except OSError as error:
            log.warning("Could not write history (%s)", error)

    # -- recording ---------------------------------------------------------

    def record(self, panel_id: str, stats: dict[str, Any], online: bool) -> None:
        """Takes a sample for one panel, at most one per SAMPLE_SECONDS."""
        samples = self._load(panel_id)
        now = time.time()

        if samples and now - samples[-1]["t"] < SAMPLE_SECONDS:
            return

        voltage = stats.get("voltage")
        if voltage is None:
            return

        samples.append(
            {
                "t": round(now),
                "v": round(float(voltage), 3),
                "b": stats.get("battery"),
                "on": bool(online),
            }
        )

        cutoff = now - RETENTION_SECONDS
        self._samples[panel_id] = [sample for sample in samples if sample["t"] >= cutoff]
        self._save(panel_id)

    # -- reading -----------------------------------------------------------

    def samples(self, panel_id: str) -> list[dict[str, Any]]:
        return self._load(panel_id)

    def charging(self, panel_id: str, current_voltage: float | None) -> bool | None:
        """True if voltage has risen over the window, None if not enough data.

        Must be called with the incoming reading *before* it is recorded, so the
        comparison is against what was known previously. Called after recording,
        the new sample would be in its own comparison set and a lone sample
        would be compared against itself, which always reads as "not charging"
        and never as "cannot tell".

        None matters: "we cannot tell yet" is a different answer from "not
        charging", and a freshly started add-on is in the first state for a while.
        """
        samples = self._load(panel_id)
        if current_voltage is None:
            return None

        now = time.time()
        window_start = now - CHARGE_WINDOW_MINUTES * 60
        earlier = [sample for sample in samples if sample["t"] >= window_start]
        if not earlier:
            return None

        # Enough of a time base to mean anything?
        if now - min(sample["t"] for sample in earlier) < MIN_EVIDENCE_SECONDS:
            return None

        # Compare against the lowest reading in the window rather than the
        # oldest: plugging in halfway through the window should still register,
        # and it makes a single noisy sample far less able to hide a real rise.
        lowest = min(sample["v"] for sample in earlier)
        return (current_voltage - lowest) >= CHARGE_THRESHOLD_V


history = History()
