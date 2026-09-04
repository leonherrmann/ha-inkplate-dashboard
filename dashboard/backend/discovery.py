"""Introduces the panel to Home Assistant over MQTT discovery.

Everything here already existed as a message on the bus; none of it reached
Home Assistant as an entity. The add-on kept the battery to itself and drew its
own sparkline, so there was no `sensor.inkplate5v2_battery` to put on a
dashboard, graph beyond the add-on's seven days, or write an automation
against.

Discovery is the convention that fixes that without anyone editing YAML: a
retained JSON message on `homeassistant/<component>/<node>/<object>/config`
describes an entity and names the topic its value appears on, and Home
Assistant creates it. Retained, so it survives a restart of either side.

Nearly every entity therefore points straight at a topic the device already
publishes -- the battery reads `<root>/stats` with a template. Only the update
entity needs a topic of its own, because Home Assistant's `update` platform
wants the installed and offered versions together in one payload and nothing
published that pair before.

The configs are republished when what is *in* them changes -- the page list,
the running firmware -- rather than on a timer, and a fingerprint keeps a
reconnect from rewriting a dozen retained messages that already say the right
thing.
"""

import json
import logging
from typing import Any

from settings import DEVICE_ID, DISCOVERY_PREFIX, topics

log = logging.getLogger(__name__)

# The panel says "online"/"offline" on its status topic, as an MQTT will, so
# every entity can hang its availability on that. The connectivity sensor is the
# exception: an entity reporting the connection cannot go unavailable when the
# connection drops, or it would never be able to say so.
AVAILABILITY = [
    {
        "topic": topics.status,
        "payload_available": "online",
        "payload_not_available": "offline",
    }
]


def _device(running: str | None) -> dict[str, Any]:
    """The block that groups every entity under one device in the UI."""
    device: dict[str, Any] = {
        "identifiers": [DEVICE_ID],
        "name": "Inkplate Dashboard",
        "manufacturer": "Soldered",
        "model": "Inkplate 5 V2",
    }
    if running:
        device["sw_version"] = running
    return device


def _entities(pages: list[dict[str, Any]], running: str | None) -> list[tuple[str, str, dict[str, Any]]]:
    """(component, object_id, config) for everything worth exposing."""
    stats = topics.stats

    entities: list[tuple[str, str, dict[str, Any]]] = [
        # Deliberately without an availability block -- see AVAILABILITY.
        (
            "binary_sensor",
            "connectivity",
            {
                "name": "Connectivity",
                "device_class": "connectivity",
                "state_topic": topics.status,
                "payload_on": "online",
                "payload_off": "offline",
                "entity_category": "diagnostic",
            },
        ),
        (
            "sensor",
            "battery",
            {
                "name": "Battery",
                "device_class": "battery",
                "state_class": "measurement",
                "unit_of_measurement": "%",
                "state_topic": stats,
                "value_template": "{{ value_json.battery }}",
            },
        ),
        (
            "sensor",
            "voltage",
            {
                "name": "Battery voltage",
                "device_class": "voltage",
                "state_class": "measurement",
                "unit_of_measurement": "V",
                "suggested_display_precision": 2,
                "state_topic": stats,
                "value_template": "{{ value_json.voltage }}",
                "entity_category": "diagnostic",
            },
        ),
        # Worked out by the add-on from the voltage trend rather than measured:
        # the panel has no charge-detect pin, and deep sleep costs it its RAM.
        (
            "binary_sensor",
            "charging",
            {
                "name": "Charging",
                "device_class": "battery_charging",
                "state_topic": topics.charging,
                "payload_on": "on",
                "payload_off": "off",
            },
        ),
        (
            "sensor",
            "rssi",
            {
                "name": "WiFi signal",
                "device_class": "signal_strength",
                "state_class": "measurement",
                "unit_of_measurement": "dBm",
                "state_topic": stats,
                "value_template": "{{ value_json.rssi }}",
                "entity_category": "diagnostic",
            },
        ),
        (
            "sensor",
            "uptime",
            {
                "name": "Uptime",
                "device_class": "duration",
                "unit_of_measurement": "s",
                "state_topic": stats,
                "value_template": "{{ value_json.uptime }}",
                "entity_category": "diagnostic",
            },
        ),
        (
            "button",
            "refresh",
            {
                "name": "Refresh",
                "command_topic": topics.command,
                "payload_press": json.dumps({"action": "refresh"}),
                "entity_category": "config",
            },
        ),
        (
            "button",
            "next_page",
            {
                "name": "Next page",
                "command_topic": topics.command,
                "payload_press": json.dumps({"action": "next_page"}),
                "entity_category": "config",
            },
        ),
        # A picture of the panel, which is the one thing about this device that
        # none of the readings above can stand in for. The entity follows a URL
        # rather than carrying the bytes: a PNG of the dashboard is around 20KB,
        # and pushing that through the broker retained on every capture, to show
        # something that only changes when asked, is a poor trade.
        #
        # The URL is on the device port rather than the editor's, because Home
        # Assistant fetches it itself and the editor is behind ingress.
        (
            "image",
            "screen",
            {
                "name": "Screen",
                "url_topic": topics.screenshot,
                "entity_category": "diagnostic",
            },
        ),
        (
            "button",
            "screenshot",
            {
                "name": "Take a screenshot",
                "command_topic": topics.command,
                "payload_press": json.dumps({"action": "screenshot"}),
                "entity_category": "config",
            },
        ),
        (
            "button",
            "send_logs",
            {
                "name": "Send the log",
                "command_topic": topics.command,
                "payload_press": json.dumps({"action": "logs"}),
                "entity_category": "config",
            },
        ),
    ]

    # A select rather than a button per page: the pages are a list of one thing
    # at a time, which is what a select is, and it shows which one is up.
    page_ids = [str(page["id"]) for page in pages if page.get("id")]
    if page_ids:
        entities.append(
            (
                "select",
                "page",
                {
                    "name": "Page",
                    "options": page_ids,
                    "state_topic": topics.page,
                    "command_topic": topics.command,
                    "command_template": '{"action": "page", "page": "{{ value }}"}',
                },
            )
        )

    # The one entity needing a topic of its own: Home Assistant wants the
    # installed and offered versions in a single payload.
    entities.append(
        (
            "update",
            "firmware",
            {
                "name": "Firmware",
                "device_class": "firmware",
                "state_topic": topics.firmware_state,
                "command_topic": topics.command,
                "payload_install": json.dumps({"action": "update"}),
            },
        )
    )

    device = _device(running)
    for _, object_id, config in entities:
        config["unique_id"] = f"{DEVICE_ID}_{object_id}"
        config["device"] = device
        if object_id != "connectivity":
            config["availability"] = AVAILABILITY

    return entities


class Discovery:
    def __init__(self) -> None:
        self._fingerprint: str | None = None

    def config_topic(self, component: str, object_id: str) -> str:
        return f"{DISCOVERY_PREFIX}/{component}/{DEVICE_ID}/{object_id}/config"

    def publish(
        self, link, pages: list[dict[str, Any]], running: str | None, force: bool = False
    ) -> None:
        """Announce every entity, if anything about them has changed.

        Cheap to call on connect, after a layout is saved and whenever the
        device reports a different build.

        `force` ignores the fingerprint, and connecting must use it. The
        add-on announces once at startup, before the broker connection has
        necessarily finished -- those publishes go nowhere, and without this
        the fingerprint they left behind would make the announcement that
        matters look redundant. It also covers a broker that restarted without
        persistence and so lost every retained config it was holding.
        """
        if not DISCOVERY_PREFIX:
            return

        entities = _entities(pages, running)
        fingerprint = json.dumps(
            [[component, object_id, config] for component, object_id, config in entities],
            sort_keys=True,
        )
        if fingerprint == self._fingerprint and not force:
            return

        published = 0
        for component, object_id, config in entities:
            if link.publish_raw(
                self.config_topic(component, object_id), json.dumps(config), retain=True
            ):
                published += 1

        # Only remembered once it is actually out, so a publish attempted while
        # the broker was away is retried on the next call rather than assumed.
        if published == len(entities):
            self._fingerprint = fingerprint
            log.info("Announced %d entities to Home Assistant over MQTT discovery", published)
        else:
            log.warning(
                "Announced only %d of %d entities; will try again", published, len(entities)
            )

    def publish_firmware_state(self, link, running: str | None, latest: str | None) -> None:
        """The update entity's payload, which has no other home on the bus.

        Home Assistant treats matching versions as "up to date", so an unknown
        latest is reported as the installed one rather than as null -- offering
        an update that may not exist is worse than offering none.
        """
        if not DISCOVERY_PREFIX or not running:
            return
        link.publish_raw(
            topics.firmware_state,
            json.dumps({"installed_version": running, "latest_version": latest or running}),
            retain=True,
        )

    def remove(self, link) -> None:
        """Retract every entity, by emptying its retained config.

        Not called today. Here because a discovery message outlives the add-on
        that sent it: turning discovery off stops new announcements but leaves
        the broker holding the old ones, so there has to be a way back.

        The dummy page matters. Without one there is no Page select in the
        list, and the one entity that would be left behind is the one this
        exists to clean up.
        """
        for component, object_id, _ in _entities([{"id": "retract"}], None):
            link.publish_raw(self.config_topic(component, object_id), "", retain=True)
        self._fingerprint = None


discovery = Discovery()
