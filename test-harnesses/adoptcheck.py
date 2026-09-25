"""Checks the add-on's half of the panel-settings handshake.

Not committed: this is the same pattern the editor's WebKit passes use -- a
harness in /tmp against the real module. What it pins is the part that is not
obvious from reading adopt.py, and that a wrong answer to would be expensive:

  - adopting has to be a no-op when the layout already agrees, because the
    settings topic is retained and replays on every reconnect. If that pushed,
    every reconnect would be a version bump and a full refresh on the panel.
  - a page id the layout has never heard of must be skipped rather than
    invented, and must not count as a change.
  - a value from a newer firmware than this add-on must be ignored rather than
    guessed at: writing a layout the device then disagrees with is the one
    state that does not settle on its own.
"""

import os
import sys
import tempfile

ROOT = os.path.expanduser(
    "~/Documents/Ich/Development/Arduino/inkplate5v2/ha-inkplate-dashboard/dashboard/backend"
)
sys.path.insert(0, ROOT)
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp())

import adopt  # noqa: E402
import store  # noqa: E402

passes = 0
failures = 0


def check(ok, what):
    global passes, failures
    if ok:
        passes += 1
    else:
        print(f"FAIL {what}")
        failures += 1


def layout():
    return {
        "version": 7,
        "orientation": 0,
        "refresh": {"ghost_percent": 12},
        "sleep": {"enabled": False, "start": "23:00", "end": "06:00"},
        "pages": [
            {"id": "main", "name": "Main", "queued": True, "widgets": []},
            {"id": "kitchen", "name": "Kitchen", "queued": True, "widgets": []},
        ],
    }


print("--- nothing to adopt ---")
one = layout()
check(adopt.merge(one, {}) == [], "an empty object changes nothing")
check(adopt.merge(one, {"orientation": 0}) == [], "and neither does a value we already have")
check(
    adopt.merge(one, {"ghost_percent": 12, "sleep_enabled": False}) == [],
    "nor a whole set the layout already agrees with",
)
check(
    adopt.merge(one, {"pages": {"main": True}}) == [],
    "nor a page that is already on",
)

print("--- adopting ---")
two = layout()
changed = adopt.merge(two, {"orientation": 180})
check(changed == ["orientation 180"], "orientation is taken over")
check(two["orientation"] == 180, "and written into the layout")

three = layout()
adopt.merge(three, {"ghost_percent": 25})
check(three["refresh"]["ghost_percent"] == 25, "so is the refresh mode")

four = layout()
adopt.merge(four, {"sleep_enabled": True})
check(four["sleep"]["enabled"] is True, "and night sleep")

five = layout()
changed = adopt.merge(five, {"pages": {"kitchen": False}})
check(changed == ["page Kitchen off"], "a page turned off on the panel is taken over")
check(five["pages"][1]["queued"] is False, "and written in")
check(five["pages"][0]["queued"] is True, "leaving the others alone")

six = layout()
changed = adopt.merge(
    six, {"orientation": 180, "ghost_percent": 50, "sleep_enabled": True}
)
check(len(changed) == 3, "several at once are all taken over")

print("--- what must be refused ---")
seven = layout()
check(
    adopt.merge(seven, {"orientation": 90}) == [],
    "a quarter turn is not a thing this panel can do, so it is ignored",
)
check(seven["orientation"] == 0, "and the layout is untouched")

eight = layout()
check(adopt.merge(eight, {"ghost_percent": 0}) == [], "0% is out of range")
check(adopt.merge(eight, {"ghost_percent": 250}) == [], "and so is 250%")
check(
    adopt.merge(eight, {"ghost_percent": "lots"}) == [],
    "and a string, which is what a newer firmware might send",
)

nine = layout()
check(
    adopt.merge(nine, {"pages": {"cellar": False}}) == [],
    "a page this layout has never heard of is skipped",
)
check(len(nine["pages"]) == 2, "and no page is invented for it")

ten = layout()
check(adopt.merge(ten, {"sleep_enabled": "yes"}) == [], "a non-boolean sleep is ignored")
check(adopt.merge(ten, None) == [], "and a payload that is not an object at all")

print("--- the round trip ---")
# The whole point: adopt, then the device sees a layout it agrees with and
# clears its override, then republishes an empty object. Adopting that must be
# a no-op, or the two would push at each other forever.
eleven = layout()
adopt.merge(eleven, {"orientation": 180})
check(
    adopt.merge(eleven, {"orientation": 180}) == [],
    "adopting the same value twice is a no-op the second time",
)
check(adopt.merge(eleven, {}) == [], "and the empty object that follows changes nothing")

print("--- a layout missing its blocks ---")
# A layout written before refresh or sleep existed. setdefault has to build one
# rather than throwing, or a panel with an old layout could never adopt.
bare = {"version": 1, "pages": []}
check(adopt.merge(bare, {"ghost_percent": 25}) != [], "a missing refresh block is created")
check(bare["refresh"]["ghost_percent"] == 25, "with the panel's value in it")
check(adopt.merge(bare, {"sleep_enabled": True}) != [], "and a missing sleep block")
check(bare["sleep"]["enabled"] is True, "likewise")
check(
    set(store.DEFAULT_SLEEP) <= set(bare["sleep"]),
    "keeping the rest of the defaults, so the window is not lost",
)

print(f"\n{passes + failures} checks, {'all adoption checks passed' if not failures else 'SOME FAILED'}")
sys.exit(1 if failures else 0)
