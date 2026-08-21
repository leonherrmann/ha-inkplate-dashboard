"""Runtime settings, all supplied by run.sh from the add-on options."""

import os

DEVICE_ID = os.environ.get("DEVICE_ID", "inkplate5v2")

MQTT_HOST = os.environ.get("MQTT_HOST", "")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USER = os.environ.get("MQTT_USER") or None
MQTT_PASSWORD = os.environ.get("MQTT_PASSWORD") or None

DATA_DIR = os.environ.get("DATA_DIR", "./data")

# Charging is inferred from the voltage trend, so both ends are tunable without
# a code change. 30 minutes and 20mV clears normal ADC noise, which is a few mV.
CHARGE_WINDOW_MINUTES = int(os.environ.get("CHARGE_WINDOW_MINUTES", "30"))
CHARGE_THRESHOLD_V = float(os.environ.get("CHARGE_THRESHOLD_V", "0.02"))
STATIC_DIR = os.environ.get("STATIC_DIR", "./static")
PORT = int(os.environ.get("PORT", "8099"))
LOG_LEVEL = os.environ.get("LOG_LEVEL", "info").upper()

# The editor is served through Home Assistant's ingress, which is authenticated
# -- the device cannot use it. Image blobs are served on this second, plain port
# instead, mapped straight to the host in config.yaml.
DEVICE_PORT = int(os.environ.get("DEVICE_PORT", "8098"))

# What the device should prefix image URLs with. Left empty, the add-on asks the
# Supervisor for the host's address and works it out; set it when that guesses
# wrong, e.g. with multiple interfaces or a reverse proxy.
IMAGE_BASE_URL = os.environ.get("IMAGE_BASE_URL", "").strip()

# Releases of the firmware repo are watched here rather than by the device: they
# are served over HTTPS, and the device has no TLS stack by design.
FIRMWARE_REPO = os.environ.get("FIRMWARE_REPO", "").strip()
FIRMWARE_POLL_HOURS = float(os.environ.get("FIRMWARE_POLL_HOURS", "6"))

# Only needed for a private repo, where the releases API answers 404 without
# one. A fine-grained token with read access to that repo's contents is enough.
FIRMWARE_TOKEN = os.environ.get("FIRMWARE_TOKEN", "").strip()

# Where Home Assistant listens for MQTT discovery. "homeassistant" is its
# default and almost nobody changes it, but a broker shared with another
# controller sometimes does. Set empty to publish no discovery at all, which
# also stops the add-on creating entities on a system that does not want them.
DISCOVERY_PREFIX = os.environ.get("DISCOVERY_PREFIX", "homeassistant").strip().strip("/")

# Present when running as a real add-on; absent when developing on a laptop, in
# which case the state bridge stays off and you can still edit and push layouts.
SUPERVISOR_TOKEN = os.environ.get("SUPERVISOR_TOKEN")
HA_WS_URL = os.environ.get("HA_WS_URL", "ws://supervisor/core/websocket")
HA_REST_URL = os.environ.get("HA_REST_URL", "http://supervisor/core/api")


class Topics:
    """The MQTT contract shared with the firmware."""

    def __init__(self, device_id: str):
        self.root = device_id
        self.manifest = f"{self.root}/manifest"
        self.config_set = f"{self.root}/config/set"
        self.config_current = f"{self.root}/config/current"
        self.status = f"{self.root}/status"
        self.stats = f"{self.root}/stats"
        self.command = f"{self.root}/command"
        # Worked out by the add-on from the voltage trend, published back so an
        # on-device widget can draw it
        self.charging = f"{self.root}/charging"
        # The page the device is currently showing
        self.page = f"{self.root}/page"
        # Retained list of uploaded images and where to fetch them, so a
        # rebooting device knows what to pull without asking
        self.images_manifest = f"{self.root}/images/manifest"
        # What build is on offer and where to fetch it
        self.firmware_manifest = f"{self.root}/firmware/manifest"
        # Installed and offered version in one payload, which is the shape Home
        # Assistant's update entity wants. Written by the add-on for Home
        # Assistant; the device neither publishes nor reads it.
        self.firmware_state = f"{self.root}/firmware/state"

    def state(self, entity_id: str, attribute: str | None = None) -> str:
        if attribute:
            return f"{self.root}/state/{entity_id}/{attribute}"
        return f"{self.root}/state/{entity_id}"


topics = Topics(DEVICE_ID)
