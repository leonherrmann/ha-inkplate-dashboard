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

HISTORY_PATH = os.path.join(DATA_DIR, "history.json")

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
        self._samples: list[dict[str, Any]] = []
        self._loaded = False

    # -- storage -----------------------------------------------------------

    def _load(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        try:
            with open(HISTORY_PATH, "r", encoding="utf-8") as handle:
                self._samples = json.load(handle)
        except FileNotFoundError:
            self._samples = []
        except (json.JSONDecodeError, OSError) as error:
            log.warning("Could not read history (%s), starting fresh", error)
            self._samples = []

    def _save(self) -> None:
        os.makedirs(DATA_DIR, exist_ok=True)
        try:
            with open(HISTORY_PATH, "w", encoding="utf-8") as handle:
                json.dump(self._samples, handle)
        except OSError as error:
            log.warning("Could not write history (%s)", error)

    # -- recording ---------------------------------------------------------

    def record(self, stats: dict[str, Any], online: bool) -> None:
        """Takes a sample, at most one per SAMPLE_SECONDS."""
        self._load()
        now = time.time()

        if self._samples and now - self._samples[-1]["t"] < SAMPLE_SECONDS:
            return

        voltage = stats.get("voltage")
        if voltage is None:
            return

        self._samples.append(
            {
                "t": round(now),
                "v": round(float(voltage), 3),
                "b": stats.get("battery"),
                "on": bool(online),
            }
        )

        cutoff = now - RETENTION_SECONDS
        self._samples = [sample for sample in self._samples if sample["t"] >= cutoff]
        self._save()

    # -- reading -----------------------------------------------------------

    def samples(self) -> list[dict[str, Any]]:
        self._load()
        return self._samples

    def charging(self, current_voltage: float | None) -> bool | None:
        """True if voltage has risen over the window, None if not enough data.

        Must be called with the incoming reading *before* it is recorded, so the
        comparison is against what was known previously. Called after recording,
        the new sample would be in its own comparison set and a lone sample
        would be compared against itself, which always reads as "not charging"
        and never as "cannot tell".

        None matters: "we cannot tell yet" is a different answer from "not
        charging", and a freshly started add-on is in the first state for a while.
        """
        self._load()
        if current_voltage is None:
            return None

        now = time.time()
        window_start = now - CHARGE_WINDOW_MINUTES * 60
        earlier = [sample for sample in self._samples if sample["t"] >= window_start]
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
