"""MQTT link to the device.

Everything the add-on knows about the device arrives here: the retained
capability manifest it publishes at boot, its online status, and its echo of the
layout it last applied.
"""

import json
import logging
import threading
from typing import Any, Callable

import paho.mqtt.client as mqtt

from settings import (
    MQTT_HOST,
    MQTT_PASSWORD,
    MQTT_PORT,
    MQTT_USER,
    topics,
)

log = logging.getLogger(__name__)


class DeviceLink:
    def __init__(self) -> None:
        self._client: mqtt.Client | None = None
        self._lock = threading.Lock()

        # Latest retained values seen from the device
        self.manifest: dict[str, Any] | None = None
        self.applied: dict[str, Any] | None = None
        self.stats: dict[str, Any] | None = None
        self.online: bool = False

        self.on_change: Callable[[], None] | None = None

    # -- lifecycle ---------------------------------------------------------

    def start(self) -> None:
        if not MQTT_HOST:
            log.error("No MQTT host configured, the device cannot be reached")
            return

        client = mqtt.Client()
        if MQTT_USER:
            client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
        client.on_connect = self._on_connect
        client.on_message = self._on_message

        log.info("Connecting to MQTT at %s:%s", MQTT_HOST, MQTT_PORT)
        client.connect_async(MQTT_HOST, MQTT_PORT, keepalive=60)
        client.loop_start()
        self._client = client

    def stop(self) -> None:
        if self._client:
            self._client.loop_stop()
            self._client.disconnect()

    # -- callbacks ---------------------------------------------------------

    def _on_connect(self, client: mqtt.Client, userdata, flags, reason_code) -> None:
        log.info("Connected to MQTT (%s)", reason_code)
        # All retained, so the current values land immediately
        client.subscribe(
            [
                (topics.manifest, 0),
                (topics.config_current, 0),
                (topics.status, 0),
                (topics.stats, 0),
            ]
        )

    def _on_message(self, client: mqtt.Client, userdata, message: mqtt.MQTTMessage) -> None:
        payload = message.payload.decode("utf-8", errors="replace")

        if message.topic == topics.status:
            self.online = payload.strip() == "online"
            log.info("Device is %s", "online" if self.online else "offline")
        elif message.topic == topics.manifest:
            self.manifest = self._parse(payload, "manifest")
            if self.manifest:
                count = len(self.manifest.get("widgets", []))
                log.info("Received a manifest describing %d widget types", count)
        elif message.topic == topics.config_current:
            self.applied = self._parse(payload, "applied config")
            log.info("Device reports applied layout: %s", self.applied)
        elif message.topic == topics.stats:
            self.stats = self._parse(payload, "stats")

        if self.on_change:
            self.on_change()

    @staticmethod
    def _parse(payload: str, what: str) -> dict[str, Any] | None:
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            log.warning("Ignoring a %s that is not valid JSON", what)
            return None

    # -- publishing --------------------------------------------------------

    def publish_layout(self, layout: dict[str, Any]) -> None:
        """Push a layout. Retained, so a rebooting device picks it straight up."""
        self._publish(topics.config_set, json.dumps(layout), retain=True)
        log.info("Pushed layout version %s", layout.get("version"))

    def publish_state(self, entity_id: str, value: str, attribute: str | None = None) -> None:
        self._publish(topics.state(entity_id, attribute), value, retain=True)

    def publish_command(self, action: str) -> None:
        self._publish(topics.command, json.dumps({"action": action}), retain=False)

    def _publish(self, topic: str, payload: str, retain: bool) -> None:
        if not self._client:
            log.warning("Not connected to MQTT, dropping a publish to %s", topic)
            return
        with self._lock:
            self._client.publish(topic, payload, retain=retain)


link = DeviceLink()
