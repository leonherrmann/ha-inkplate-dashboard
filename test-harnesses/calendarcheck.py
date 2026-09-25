"""The calendar poller: Home Assistant's events in, the card's slots out.

    cd ha-inkplate-dashboard/dashboard/backend
    PYTHONPATH=. /tmp/ink-venv/bin/python ../../test-harnesses/calendarcheck.py [--states OUT.json]

The contract is CalendarCard.h's. --states writes the slots as a simulator
states file, so the card can be drawn from exactly what this produced:

    ./sim/preview --widget calendar --size 3x3 --opt calendar=sim.calendar \\
        --date 2026-09-15 --time 09:41 --states OUT.json
"""

import json
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

import calendar_bridge as cb

passes = 0
failures = 0


def check(ok: bool, what: str) -> None:
    global passes, failures
    if ok:
        passes += 1
        print("ok   " + what)
    else:
        failures += 1
        print("FAIL " + what)


BERLIN = ZoneInfo("Europe/Berlin")
TODAY = datetime(2026, 9, 15, tzinfo=BERLIN)

# Shaped as GET /api/calendars/<entity> answers: each event in the offset it
# was written in, all-day ones as bare dates with an exclusive end.
EVENTS = [
    # Finished yesterday: not wanted
    {"summary": "Yesterday", "start": {"dateTime": "2026-09-14T09:00:00+02:00"},
     "end": {"dateTime": "2026-09-14T10:00:00+02:00"}},
    # Written in UTC: 07:30Z is 09:30 in Berlin in September
    {"summary": "Standup", "start": {"dateTime": "2026-09-15T07:30:00Z"},
     "end": {"dateTime": "2026-09-15T08:00:00Z"}},
    # Out of order on purpose
    {"summary": "Lunch with Anna", "start": {"dateTime": "2026-09-15T13:00:00+02:00"},
     "end": {"dateTime": "2026-09-15T13:45:00+02:00"}},
    # Started yesterday, ends today: still on
    {"summary": "Night shift", "start": {"dateTime": "2026-09-14T22:00:00+02:00"},
     "end": {"dateTime": "2026-09-15T06:00:00+02:00"}},
    # All day, today
    {"summary": "Katharina's birthday", "start": {"date": "2026-09-15"},
     "end": {"date": "2026-09-16"}},
    # Floating time, no offset
    {"summary": "Dentist", "start": {"dateTime": "2026-09-16T11:00:00"},
     "end": {"dateTime": "2026-09-16T12:00:00"}},
    # Multi-day
    {"summary": "Trip to Lisbon " + "x" * 200, "start": {"date": "2026-09-18"},
     "end": {"date": "2026-09-21"}},
] + [
    {"summary": f"Later {n}", "start": {"dateTime": f"2026-09-{20 + n:02d}T10:00:00+02:00"},
     "end": {"dateTime": f"2026-09-{20 + n:02d}T11:00:00+02:00"}}
    for n in range(1, 10)
]

slots = cb.slots_for(EVENTS, BERLIN, TODAY)
parsed = [json.loads(one) for one in slots]
names = [one.get("summary") for one in parsed]
print("   ", names)

check(len(slots) == cb.SLOTS, f"exactly {cb.SLOTS} slots, the card's count")
check("Yesterday" not in names, "an event that finished before today is left out")
check(names[0] == "Night shift", "one that started yesterday and ends today is kept, first")
check(names[1] == "Katharina's birthday", "an all-day event sorts ahead of that day's timed ones")
standup = next(one for one in parsed if one.get("summary") == "Standup")
check(standup["start"] == "2026-09-15T09:30" and standup["end"] == "2026-09-15T10:00",
      f"a UTC time is given in Berlin's wall clock ({standup['start']})")
check(names.index("Standup") < names.index("Lunch with Anna"), "timed events are in order")
dentist = next(one for one in parsed if one.get("summary") == "Dentist")
check(dentist["start"] == "2026-09-16T11:00", "a floating time is taken as local")
birthday = parsed[1]
check(birthday == {"summary": "Katharina's birthday", "start": "2026-09-15",
                   "end": "2026-09-16", "all_day": True},
      "an all-day event is dates alone, with the exclusive end kept")
trip = next(one for one in parsed if one.get("summary", "").startswith("Trip"))
check(len(trip["summary"]) == cb.SUMMARY_CHARS, "a very long summary is cut")
check(trip["end"] == "2026-09-21", "a multi-day event keeps its end")
check(names[-1] == "Later 6" and "Later 7" not in names,
      "past twelve, the latest are the ones left off")

quiet = cb.slots_for(EVENTS[:1], BERLIN, TODAY)
check(quiet == ["{}"] * cb.SLOTS,
      'a calendar with nothing to come fills every slot with "{}", which stays retained')

# Only what changed goes out again
sent = []
cb.link.publish_state = lambda entity, payload, attribute=None: sent.append((attribute, payload))
bridge = cb.CalendarBridge()
bridge._publish("calendar.family", slots)
first = len(sent)
bridge._publish("calendar.family", slots)
check(first == cb.SLOTS and len(sent) == first, "an unchanged calendar is not republished")
bridge._publish("calendar.family", ["{}"] + slots[1:])
check(len(sent) == first + 1 and sent[-1] == ("events/1", "{}"), "a changed slot alone is sent")
check(all(attribute.startswith("events/") for attribute, _ in sent),
      "under state/<entity>/events/<n>")

if "--states" in sys.argv:
    out = sys.argv[sys.argv.index("--states") + 1]
    with open(out, "w", encoding="utf-8") as handle:
        json.dump({f"sim.calendar/events/{i}": json.loads(p) for i, p in enumerate(slots, start=1)},
                  handle, ensure_ascii=False, indent=1)
    print(f"wrote {out}")

print(f"\n{passes + failures} checks, "
      + ("all calendar checks passed" if failures == 0 else f"{failures} FAILED"))
sys.exit(0 if failures == 0 else 1)
