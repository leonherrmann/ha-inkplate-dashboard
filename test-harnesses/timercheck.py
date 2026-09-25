"""Checks the timer mirror's load-bearing behaviours: that Home Assistant's
H:MM:SS is read correctly, and that our own echo is dropped while somebody
else's change is forwarded. Get the second wrong and the panel and the helper
start each other in a loop -- which they did, on the panel, on 2026-09-10.

The sections at the end are that fault. Dropping the echo was never one test
but three, and the two that were missing are the two that lost: the state
change arrives before the call that caused it has been answered, and a helper
that merely agrees with the panel has nothing to tell it."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("SUPERVISOR_TOKEN", "test")
import ha_timer
import panels

passes = failures = 0

# One panel to be about. Every entry point on the mirror names the panel now:
# each panel has its own timer, its own helper entity and its own buttons, so
# "the panel" is no longer a thing the mirror can assume.
PANEL = "inkplate-a864a0"
panels.seen(PANEL, "inkplate5v2")
HELPER = ha_timer.helper_entity(PANEL)
def check(ok, what):
    global passes, failures
    if ok: passes += 1
    else:
        print(f"FAIL {what}"); failures += 1

print("--- reading Home Assistant's remaining time ---")
check(ha_timer._seconds("0:05:00") == 300, "five minutes")
check(ha_timer._seconds("1:00:00") == 3600, "an hour")
check(ha_timer._seconds("0:00:45") == 45, "forty-five seconds")
check(ha_timer._seconds(None) == 0, "nothing at all")
check(ha_timer._seconds("nonsense") == 0, "something unparseable, rather than throwing")

print("--- our own echo is not sent back to the panel ---")
sent = []
m = ha_timer.TimerMirror()
m._publish_command = lambda panel, command: sent.append(command)
m._ours.append("ctx-ours")

# What a state change caused by our own timer.start looks like coming back.
m._forward(PANEL, "active", {"attributes": {"remaining": "0:10:00"}})
check(len(sent) == 1, "a change we did not cause is forwarded")
check(sent[0]["action"] == "timer_start", "as a start")
check(sent[0]["seconds"] == 600, "carrying the remaining time")

sent.clear()
m._forward(PANEL, "paused", {})
check(sent and sent[0]["action"] == "timer_pause", "paused is forwarded")
sent.clear()
m._forward(PANEL, "idle", {})
check(sent and sent[0]["action"] == "timer_cancel", "idle is forwarded as a cancel")

print("--- the panel's state is not re-mirrored when it has not changed ---")
m2 = ha_timer.TimerMirror()
m2.on_panel_timer(PANEL, '{"state": "idle", "remaining": 0}')
first = dict(m2._last_panel)
m2.on_panel_timer(PANEL, '{"state": "idle", "remaining": 0}')
check(m2._last_panel == first, "an identical payload is ignored")
m2.on_panel_timer(PANEL, 'not json')
check(m2._last_panel == first, "and so is one that is not JSON")

print("--- two panels keep their own timers apart ---")
OTHER = "inkplate-000001"
panels.seen(OTHER, "inkplate5v1")
check(ha_timer.helper_entity(OTHER) != HELPER, "each panel mirrors to its own helper")
m2.on_panel_timer(OTHER, '{"state": "running", "remaining": 300}')
check(m2._last_panel[PANEL]["state"] == "idle", "one panel's timer does not overwrite the other's")
check(m2._last_panel[OTHER]["state"] == "running", "and each is remembered under its own id")

print("--- context memory does not grow without bound ---")
m3 = ha_timer.TimerMirror()
for i in range(200):
    m3._ours.append(f"ctx-{i}")
    del m3._ours[:-ha_timer.CONTEXT_MEMORY]
check(len(m3._ours) == ha_timer.CONTEXT_MEMORY, "it is capped")
check("ctx-199" in m3._ours, "keeping the newest")

# --- the loop that reached the panel on 2026-09-10 ----------------------------

def helper_event(state, remaining=None, context="ctx-somebody-else"):
    """A state_changed for the helper, shaped as Home Assistant sends it."""
    attributes = {}
    if remaining is not None:
        attributes["remaining"] = remaining
    return {
        "event": {
            "data": {
                "entity_id": HELPER,
                "new_state": {"state": state, "attributes": attributes},
            },
            "context": {"id": context},
        }
    }

print("--- a change we caused is dropped even before we know its context ---")
sent = []
m4 = ha_timer.TimerMirror()
m4._publish_command = lambda panel, command: sent.append(command)
m4._last_panel = {PANEL: {"state": "running", "remaining": 1115}}
# What _call does before the request goes out. Home Assistant fires the state
# change here -- before it answers, so before the context has been recorded.
m4._calls_in_flight = 1
m4._on_helper_event(PANEL, helper_event("active", "0:18:35"))
check(not sent, "nothing is sent to the panel while our own call is in the air")

m4._calls_in_flight = 0
m4._settled_until = ha_timer._now() + 5
m4._on_helper_event(PANEL, helper_event("active", "0:18:35"))
check(not sent, "nor in the moment after it has been answered")

print("--- a helper that agrees with the panel is not commanded ---")
sent.clear()
m5 = ha_timer.TimerMirror()
m5._publish_command = lambda panel, command: sent.append(command)
m5._last_panel = {PANEL: {"state": "running", "remaining": 1115}}
m5._on_helper_event(PANEL, helper_event("active", "0:18:33"))
check(not sent, "a start that asks for what is already running is dropped")
m5._last_panel = {PANEL: {"state": "paused", "remaining": 1115}}
m5._on_helper_event(PANEL, helper_event("paused"))
check(not sent, "and so is a pause when the panel is already paused")

print("--- but a real change from Home Assistant still reaches the panel ---")
sent.clear()
m6 = ha_timer.TimerMirror()
m6._publish_command = lambda panel, command: sent.append(command)
m6._last_panel = {PANEL: {"state": "paused", "remaining": 1115}}
m6._on_helper_event(PANEL, helper_event("active", "0:05:00"))
check(len(sent) == 1 and sent[0]["action"] == "timer_start",
      "starting the helper while the panel is paused is forwarded")
check(sent[0]["seconds"] == 300, "with the time it was given")

sent.clear()
m6._last_panel = {PANEL: {"state": "running", "remaining": 1115}}
m6._on_helper_event(PANEL, helper_event("paused"))
check(len(sent) == 1 and sent[0]["action"] == "timer_pause",
      "pausing it while the panel runs is forwarded")

sent.clear()
m6._on_helper_event(PANEL, helper_event("idle"))
check(len(sent) == 1 and sent[0]["action"] == "timer_cancel",
      "and cancelling it is forwarded")

print("--- the guard is wired to the call, not just to the flag ---")
# The whole fault was an ordering one, so this drives the real _call with a
# fake Home Assistant that fires the state change from inside the request --
# which is when Home Assistant really fires it, before it answers. The reply
# carries no context at all, which is the worst case the old code had no
# answer to.
import asyncio

class _FakeResponse:
    def __init__(self, on_enter): self._on_enter = on_enter
    async def __aenter__(self):
        self._on_enter()
        return self
    async def __aexit__(self, *rest): return False
    def raise_for_status(self): pass
    async def json(self): return []

class _FakeSession:
    def __init__(self, on_enter): self._on_enter = on_enter
    async def __aenter__(self): return self
    async def __aexit__(self, *rest): return False
    def post(self, *args, **kw): return _FakeResponse(self._on_enter)

raced = []
m8 = ha_timer.TimerMirror()
m8._publish_command = lambda panel, command: raced.append(command)
# The panel is paused, so the arriving "active" does NOT agree with it: the
# only thing that can stop it is the in-flight guard.
m8._last_panel = {PANEL: {"state": "paused", "remaining": 1115}}

def fire_mid_call():
    m8._on_helper_event(PANEL, helper_event("active", "0:18:35"))

real_session = ha_timer.aiohttp.ClientSession
ha_timer.aiohttp.ClientSession = lambda **kw: _FakeSession(fire_mid_call)
try:
    asyncio.run(m8._call(PANEL, "timer.start", {"duration": 1115}))
finally:
    ha_timer.aiohttp.ClientSession = real_session

check(not raced, "the change our own call caused is not sent back to the panel")
check(m8._calls_in_flight == 0, "and the call is not left counted as in flight")

print("--- a republish that says nothing new costs no service call ---")
called = []
m7 = ha_timer.TimerMirror()
async def fake_call(panel, service, data):
    called.append((panel, service, data))
m7._call = fake_call
running = {"state": "running", "remaining": 1115, "ends_at": "2026-09-10T12:00:00+00:00"}
asyncio.run(m7._mirror_to_helper(PANEL, running))
check(len(called) == 1, "the first one is mirrored")
# The panel republishes every 30s and `remaining` has moved on, but the timer
# is the same timer: same state, same end instant.
asyncio.run(m7._mirror_to_helper(PANEL, {**running, "remaining": 1085}))
check(len(called) == 1, "a republish with only the remaining moved on is not")
asyncio.run(m7._mirror_to_helper(PANEL, {**running, "ends_at": "2026-09-10T12:10:00+00:00"}))
check(len(called) == 2, "but a new end instant is")

print(f"\n{passes + failures} checks, " + ("all timer mirror checks passed" if not failures else "SOME FAILED"))
sys.exit(1 if failures else 0)
