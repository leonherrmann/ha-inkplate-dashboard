"""Imports every backend module, exactly as uvicorn does at startup.

This exists because 2026.9.29 shipped an add-on that could not start at all: a
blind text edit turned `from history import history` into `from history import
ha_timer`, and nothing caught it. py_compile does not resolve imports -- it
parses -- and the other harnesses import only the one module they test, so a
broken import in mqtt.py was invisible until Home Assistant tried to boot it
and crash-looped.

Run before releasing. If this passes, the add-on can at least start.
"""

import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DATA_DIR", "/tmp/inkplate-importcheck")

# main last: it pulls in everything else, so a failure earlier in the list
# names the module that is actually broken rather than the one that imported it.
MODULES = [
    "settings",
    "history",
    "ha_timer",
    "discovery",
    "adopt",
    "store",
    "images",
    "weather",
    "firmware",
    "mqtt",
    "ha_bridge",
    "device_api",
    "main",
]

failures = 0
for name in MODULES:
    try:
        importlib.import_module(name)
        print(f"ok   {name}")
    except Exception as error:
        print(f"FAIL {name}: {type(error).__name__}: {error}")
        failures += 1

print(f"\n{len(MODULES)} modules, " + ("all import" if not failures else "SOME FAILED"))
sys.exit(1 if failures else 0)
