"""Publishes the upcoming events of the calendars a layout references.

The calendar card has drawn a list, a week and a month since firmware
v2026.9.37, but nothing fed it: Home Assistant puts only the *next* event on a
calendar entity's attributes, which the bridge already republishes, so every
size showed one event however much room it had. The rest of a calendar is only
available from GET /api/calendars/<entity>, which this polls.

The contract is the card's (CalendarCard.h), and it is deliberately the weather
forecast's: one retained topic per slot,

    inkplate5v2/state/<entity>/events/<n>
    {"summary": "Dentist", "start": "2026-09-15T09:30", "end": "2026-09-15T10:15"}

- **Local wall-clock times, never converted on the panel.** Home Assistant
  answers in whatever offset each event was written in; they are all put into
  Home Assistant's own zone here, because the panel has no tzdata and draws the
  digits it is given.
- **An all-day event carries dates alone.** Home Assistant's end date is
  exclusive, and the card expects exactly that.
- **"{}" empties a slot.** A day with three events has to clear the fourth that
  yesterday left retained. An empty payload would do that too, but a zero-length
  retained message *deletes* the retained copy, so a panel that reconnects
  afterwards would be handed nothing at all for that slot and keep what it had.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, datetime, timedelta
from typing import Any, Iterable
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import aiohttp

from mqtt import link
from registry import registry
from settings import HA_REST_URL, SUPERVISOR_TOKEN

log = logging.getLogger(__name__)

# Calendars change when somebody edits one, which is rare; the card rolls the
# day over and drops finished events by itself, so nothing on the panel waits
# on this between polls.
REFRESH_SECONDS = 900

# The card's own slot count (CALENDAR_MAX_EVENTS), per calendar
SLOTS = 12

# How far ahead to look. Long enough for the month grid to mark every day left
# in this month with something on it, as far as twelve events reach.
LOOKAHEAD_DAYS = 35

# The card lays a summary out on one line and cuts it to fit, so anything past
# this is bytes over the panel's WiFi that can never be drawn.
SUMMARY_CHARS = 80


class CalendarBridge:
    def __init__(self) -> None:
        self._entities: set[str] = set()
        self._task: asyncio.Task | None = None
        self._wake = asyncio.Event()
        # What each slot last carried, so an unchanged calendar is not
        # republished every quarter of an hour to every panel.
        self._sent: dict[tuple[str, int], str] = {}

    def follow(self, entity_ids: Iterable[str]) -> None:
        entities = {entity for entity in entity_ids if entity.startswith("calendar.")}
        if entities == self._entities:
            return
        self._entities = entities
        log.info("Following %d calendars", len(entities))
        self._wake.set()

    def start(self) -> None:
        if not SUPERVISOR_TOKEN:
            return
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run(self) -> None:
        while True:
            try:
                if self._entities:
                    await self._publish_all()
            except asyncio.CancelledError:
                raise
            except Exception as error:  # noqa: BLE001 - keep the timer alive
                log.warning("Calendar refresh failed (%s)", error)

            self._wake.clear()
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=REFRESH_SECONDS)
            except asyncio.TimeoutError:
                pass

    async def _publish_all(self) -> None:
        zone = _zone(registry.time_zone)
        start = datetime.now(zone).replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=LOOKAHEAD_DAYS)
        headers = {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}
        async with aiohttp.ClientSession(headers=headers) as session:
            for entity_id in sorted(self._entities):
                try:
                    raw = await _fetch(session, entity_id, start, end)
                except Exception as error:  # noqa: BLE001 - one bad calendar, not all
                    log.warning("Could not read %s (%s)", entity_id, error)
                    continue
                self._publish(entity_id, slots_for(raw, zone, start))

    def _publish(self, entity_id: str, payloads: list[str]) -> None:
        changed = 0
        for index, payload in enumerate(payloads, start=1):
            key = (entity_id, index)
            if self._sent.get(key) == payload:
                continue
            link.publish_state(entity_id, payload, attribute=f"events/{index}")
            self._sent[key] = payload
            changed += 1
        if changed:
            filled = sum(1 for payload in payloads if payload != "{}")
            log.info("Published %d events for %s (%d slots changed)", filled, entity_id, changed)


async def _fetch(
    session: aiohttp.ClientSession, entity_id: str, start: datetime, end: datetime
) -> list[dict[str, Any]]:
    url = (
        f"{HA_REST_URL}/calendars/{quote(entity_id)}"
        f"?start={quote(start.isoformat())}&end={quote(end.isoformat())}"
    )
    async with session.get(url, timeout=aiohttp.ClientTimeout(total=20)) as response:
        response.raise_for_status()
        body = await response.json()
    return body if isinstance(body, list) else []


def slots_for(events: list[dict[str, Any]], zone: ZoneInfo, day_start: datetime) -> list[str]:
    """The card's SLOTS payloads for one calendar's events, soonest first.

    Everything that has not finished before today began: today's earlier events
    are kept, because the card decides for itself what has ended -- it rolls
    over at midnight and drops a finished event at the minute it finishes,
    neither of which a poll every fifteen minutes could do.
    """
    parsed = []
    for event in events:
        entry = _event(event, zone)
        if entry is None:
            continue
        sort_key, finishes, payload = entry
        if finishes <= day_start:
            continue
        parsed.append((sort_key, payload))

    parsed.sort(key=lambda item: item[0])
    payloads = [json.dumps(payload, ensure_ascii=False) for _, payload in parsed[:SLOTS]]
    return payloads + ["{}"] * (SLOTS - len(payloads))


def _event(event: dict[str, Any], zone: ZoneInfo) -> tuple[datetime, datetime, dict] | None:
    """(sorts by, finishes at, payload) for one Home Assistant event, or None."""
    begins = event.get("start") or {}
    ends = event.get("end") or {}
    summary = str(event.get("summary") or "").strip()[:SUMMARY_CHARS]

    if "dateTime" in begins:
        start = _local(begins["dateTime"], zone)
        finish = _local(ends.get("dateTime"), zone) if "dateTime" in ends else start
        if start is None:
            return None
        finish = finish or start
        payload = {
            "summary": summary,
            "start": start.strftime("%Y-%m-%dT%H:%M"),
            "end": finish.strftime("%Y-%m-%dT%H:%M"),
        }
        return start, finish, payload

    if "date" in begins:
        try:
            first = date.fromisoformat(begins["date"])
            after = date.fromisoformat(ends.get("date") or begins["date"])
        except ValueError:
            return None
        if after <= first:
            after = first + timedelta(days=1)
        start = datetime(first.year, first.month, first.day, tzinfo=zone)
        finish = datetime(after.year, after.month, after.day, tzinfo=zone)
        payload = {
            "summary": summary,
            "start": first.isoformat(),
            "end": after.isoformat(),
            "all_day": True,
        }
        # An all-day event sorts at the very start of its day, ahead of that
        # day's timed ones, which is where a list puts it.
        return start, finish, payload

    return None


def _local(stamp: str | None, zone: ZoneInfo) -> datetime | None:
    if not stamp:
        return None
    try:
        moment = datetime.fromisoformat(stamp)
    except ValueError:
        return None
    # A floating time with no offset is already wall-clock in Home Assistant's zone
    return moment.replace(tzinfo=zone) if moment.tzinfo is None else moment.astimezone(zone)


def _zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or "UTC")
    except ZoneInfoNotFoundError:
        log.warning("Unknown time zone %r, using UTC for calendars", name)
        return ZoneInfo("UTC")


calendars = CalendarBridge()
