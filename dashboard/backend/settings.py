"""Runtime settings, all supplied by run.sh from the add-on options."""

import os

DEVICE_ID = os.environ.get("DEVICE_ID", "inkplate5v2")

MQTT_HOST = os.environ.get("MQTT_HOST", "")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USER = os.environ.get("MQTT_USER") or None
MQTT_PASSWORD = os.environ.get("MQTT_PASSWORD") or None

DATA_DIR = os.environ.get("DATA_DIR", "./data")
STATIC_DIR = os.environ.get("STATIC_DIR", "./static")
PORT = int(os.environ.get("PORT", "8099"))
LOG_LEVEL = os.environ.get("LOG_LEVEL", "info").upper()

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

    def state(self, entity_id: str, attribute: str | None = None) -> str:
        if attribute:
            return f"{self.root}/state/{entity_id}/{attribute}"
        return f"{self.root}/state/{entity_id}"


topics = Topics(DEVICE_ID)
