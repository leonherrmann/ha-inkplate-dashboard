"""MQTT link to the device.

Everything the add-on knows about the device arrives here: the retained
capability manifest it publishes at boot, its online status, and its echo of the
layout it last applied.
"""

import json
import logging
import threading
import time
from typing import Any, Callable

import paho.mqtt.client as mqtt

from history import history
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
        # None while there is not yet enough history to tell
        self.charging: bool | None = None
        self.current_page: str | None = None
        # Unix time of the last message from the device. Retained messages
        # replay on connect, so this starts as "when we first heard it" rather
        # than being truly live -- close enough to answer "is it still there".
        self.last_seen: float | None = None

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
                (topics.page, 0),
            ]
        )

    def _on_message(self, client: mqtt.Client, userdata, message: mqtt.MQTTMessage) -> None:
        payload = message.payload.decode("utf-8", errors="replace")
        self.last_seen = time.time()

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
        elif message.topic == topics.page:
            self.current_page = payload.strip()
        elif message.topic == topics.stats:
            self.stats = self._parse(payload, "stats")
            if self.stats:
                # Order matters: the trend is judged against what was already
                # known, before this reading joins the history. The other way
                # round, a lone sample gets compared against itself.
                self.charging = history.charging(self.stats.get("voltage"))
                history.record(self.stats, self.online)
                self.publish_charging(self.charging)

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

    def publish_command(self, action: str, **extra: Any) -> None:
        self._publish(topics.command, json.dumps({"action": action, **extra}), retain=False)

    def publish_images(self, manifest: dict[str, Any]) -> None:
        """Tell the device which images exist and where to fetch them.

        Retained: a device that reboots, or that was asleep when an image was
        uploaded, picks this up on connect and syncs without being asked.
        """
        self._publish(topics.images_manifest, json.dumps(manifest), retain=True)
        log.info("Published an image manifest listing %d images", len(manifest.get("images", [])))

    def publish_firmware(self, manifest: dict[str, Any]) -> None:
        """Retained, so a device that was asleep sees the offer when it wakes."""
        self._publish(topics.firmware_manifest, json.dumps(manifest), retain=True)
        if manifest:
            log.info("Offering firmware %s", manifest.get("version"))

    def publish_charging(self, charging: bool | None) -> None:
        """Charging is worked out here, so the device is told the answer.

        Retained, so an on-device widget shows the right thing the moment it
        subscribes rather than after the next change.
        """
        if charging is None:
            return
        self._publish(topics.charging, "on" if charging else "off", retain=True)

    def _publish(self, topic: str, payload: str, retain: bool) -> None:
        if not self._client:
            log.warning("Not connected to MQTT, dropping a publish to %s", topic)
            return
        with self._lock:
            self._client.publish(topic, payload, retain=retain)


link = DeviceLink()
