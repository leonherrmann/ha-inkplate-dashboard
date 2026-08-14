"""Home Assistant's timezone, expressed the way the ESP32 needs it.

Home Assistant reports an IANA name like "Europe/Berlin". The device has no
tzdata, so it needs a POSIX TZ string instead. Common zones are mapped
explicitly because those strings carry the daylight-saving rules; anything else
falls back to the offset in force right now, which is correct until the next DST
transition and gets corrected on the following push.
"""

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

log = logging.getLogger(__name__)

DEFAULT = "CET-1CEST,M3.5.0,M10.5.0/3"

# EU rule: last Sunday in March to last Sunday in October
_EU = "M3.5.0,M10.5.0/3"
# US rule: second Sunday in March to first Sunday in November
_US = "M3.2.0,M11.1.0"

KNOWN = {
    "Europe/Berlin": f"CET-1CEST,{_EU}",
    "Europe/Amsterdam": f"CET-1CEST,{_EU}",
    "Europe/Brussels": f"CET-1CEST,{_EU}",
    "Europe/Copenhagen": f"CET-1CEST,{_EU}",
    "Europe/Madrid": f"CET-1CEST,{_EU}",
    "Europe/Oslo": f"CET-1CEST,{_EU}",
    "Europe/Paris": f"CET-1CEST,{_EU}",
    "Europe/Prague": f"CET-1CEST,{_EU}",
    "Europe/Rome": f"CET-1CEST,{_EU}",
    "Europe/Stockholm": f"CET-1CEST,{_EU}",
    "Europe/Vienna": f"CET-1CEST,{_EU}",
    "Europe/Warsaw": f"CET-1CEST,{_EU}",
    "Europe/Zurich": f"CET-1CEST,{_EU}",
    "Europe/London": f"GMT0BST,{_EU}",
    "Europe/Dublin": f"GMT0IST,{_EU}",
    "Europe/Lisbon": f"WET0WEST,{_EU}",
    "Europe/Athens": f"EET-2EEST,{_EU}",
    "Europe/Helsinki": f"EET-2EEST,{_EU}",
    "Europe/Kyiv": f"EET-2EEST,{_EU}",
    "America/New_York": f"EST5EDT,{_US}",
    "America/Chicago": f"CST6CDT,{_US}",
    "America/Denver": f"MST7MDT,{_US}",
    "America/Los_Angeles": f"PST8PDT,{_US}",
    "UTC": "UTC0",
}


def to_posix(iana: str | None) -> str:
    """POSIX TZ string for an IANA zone name."""
    if not iana:
        return DEFAULT

    if iana in KNOWN:
        return KNOWN[iana]

    try:
        offset = datetime.now(ZoneInfo(iana)).utcoffset()
    except Exception:  # noqa: BLE001 - unknown zone, fall back
        log.warning("Unknown timezone %s, falling back to %s", iana, DEFAULT)
        return DEFAULT

    if offset is None:
        return DEFAULT

    # POSIX writes the offset with the opposite sign to the usual UTC+X
    hours = -offset.total_seconds() / 3600
    text = f"{hours:g}"
    log.info("No DST rules known for %s; using the current offset only", iana)
    return f"UTC{text}"
