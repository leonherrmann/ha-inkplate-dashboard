"""MQTT link to the panels.

Everything the add-on knows about a panel arrives here: the retained capability
manifest it publishes at boot, its online status, and its echo of the layout it
last applied.

**However many panels there are.** Each has its own topics under
`<root>/devices/<id>/` and its own PanelState below; the link subscribes to the
wildcard rather than to a list, so a panel that is plugged in for the first time
appears without anything being configured. Three topics stay shared and are
published once for everyone -- the entity states, the image manifest and the
firmware manifest -- because they say the same thing to every panel.
"""

import json
import logging
import threading
import time
from typing import Any, Callable

import paho.mqtt.client as mqtt

import adopt
import firmware
import manifest_store
import panels
import store
from discovery import discovery
from history import history
import ha_timer
from settings import (
    MQTT_HOST,
    MQTT_PASSWORD,
    MQTT_PORT,
    MQTT_USER,
    topics,
)

log = logging.getLogger(__name__)


class PanelState:
    """What one panel is currently telling us about itself.

    Live values only: everything here is republished by the panel on connect,
    so none of it is written to disk. What *is* kept -- the name, the layout,
    the manifest -- lives in panels.py, store.py and manifest_store.py.
    """

    def __init__(self, panel_id: str) -> None:
        self.id = panel_id
        # Latest retained values seen from the device
        self.applied: dict[str, Any] | None = None
        self.stats: dict[str, Any] | None = None
        self.online: bool = False
        # None while there is not yet enough history to tell
        self.charging: bool | None = None
        self.current_page: str | None = None
        # Whether the panel is holding that page rather than rotating on. Set
        # from the panel's buttons only; the editor shows it and does not offer
        # to change it.
        self.page_locked: bool = False
        # Settings the panel is overriding, from its own menu. Empty is the
        # normal state and means it is doing what the layout says.
        self.overrides: dict[str, Any] = {}
        # Unix time of the last message from the device. Retained messages
        # replay on connect, so this starts as "when we first heard it" rather
        # than being truly live -- close enough to answer "is it still there".
        self.last_seen: float | None = None

    @property
    def manifest(self) -> dict[str, Any] | None:
        """What this panel says it can draw.

        Read from disk rather than held here: the firmware POSTs it to the
        device HTTP port, which is a different process, so the file in DATA_DIR
        is the only place both can meet. Cheap -- manifest_store caches on mtime.
        """
        return manifest_store.load(self.id)


class DeviceLink:
    def __init__(self) -> None:
        self._client: mqtt.Client | None = None
        self._lock = threading.Lock()

        # One entry per panel heard from since this process started. Panels
        # known from earlier runs are in panels.py and get a state here as soon
        # as their retained status replays, which is within a second of
        # connecting.
        self._panels: dict[str, PanelState] = {}

        self.on_change: Callable[[], None] | None = None

    def panel(self, panel_id: str) -> PanelState:
        """The live state for a panel, created empty if it has not spoken yet.

        Never None: the editor asks about whichever panel it is showing, and
        that may be one that has not been online since the add-on started.
        Empty state reads as "offline with nothing to report", which is exactly
        what is true.
        """
        state = self._panels.get(panel_id)
        if state is None:
            state = PanelState(panel_id)
            self._panels[panel_id] = state
        return state

    def known(self) -> list[PanelState]:
        return list(self._panels.values())

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
        # A wildcard per leaf rather than a list per panel: this is how a panel
        # is discovered at all. Its retained status replays the moment we
        # subscribe, and that is the first this add-on hears of it -- nothing
        # has to be paired, configured or asked for.
        #
        # All retained, so the current values land immediately.
        client.subscribe(
            [
                (topics.every_device("manifest"), 0),
                (topics.every_device("config/current"), 0),
                (topics.every_device("status"), 0),
                (topics.every_device("stats"), 0),
                (topics.every_device("page"), 0),
                (topics.every_device("lock"), 0),
                (topics.every_device("settings"), 0),
                (topics.every_device("timer"), 0),
            ]
        )
        # Before the retained messages land, so Home Assistant has the entities
        # by the time their first values arrive. announce() runs again when the
        # stats come in, which is where the running version comes from.
        self.announce(force=True)

    def announce(self, panel_id: str | None = None, force: bool = False) -> None:
        """Keep Home Assistant's picture of the panels current.

        Cheap and idempotent: discovery skips the publish unless something it
        would say has actually changed, so this can be called from anywhere
        that might have changed it. Connecting passes force -- see there.

        Every panel unless one is named. Callers that changed one panel's pages
        or heard one panel's stats say which; a connect announces the lot.
        """
        wanted = [panel_id] if panel_id else panels.ids()
        for one in wanted:
            panel = panels.get(one)
            if panel is None:
                continue
            running = ((self.panel(one).stats or {}).get("firmware") or {}).get("running")
            try:
                pages = store.load(one).get("pages", [])
            except Exception as error:  # a broken layout must not cost the link
                log.warning("Could not read the layout of %s for discovery: %s", one, error)
                pages = []
            discovery.publish(self, panel, pages, running, force=force)
            discovery.publish_firmware_state(
                self, one, running, firmware.store.state.get("version")
            )

    def _on_message(self, client: mqtt.Client, userdata, message: mqtt.MQTTMessage) -> None:
        payload = message.payload.decode("utf-8", errors="replace")

        panel_id = topics.panel_of(message.topic)
        leaf = topics.leaf_of(message.topic)
        if not panel_id or not leaf:
            # Nothing else is subscribed to, but a broker replaying something
            # odd must not take the callback down with it.
            log.debug("Ignoring a message on %s", message.topic)
            return

        state = self.panel(panel_id)
        state.last_seen = time.time()

        if leaf == "status":
            state.online = payload.strip() == "online"
            # Registered on every message, not only the first: this is what
            # keeps `last_seen` and the model current, and it is how a panel
            # that has never been heard from before gets into the device list.
            panels.seen(panel_id)
            log.info("Panel %s is %s", panel_id, "online" if state.online else "offline")
        elif leaf == "manifest":
            # Written through to the same place the HTTP route writes, so the
            # editor has one answer to what the panel can draw rather than two
            # that can disagree about which arrived last.
            try:
                owner, stored = manifest_store.save(payload, panel_id)
            except manifest_store.ManifestError as problem:
                log.warning("Ignoring the manifest from %s on MQTT: %s", panel_id, problem)
            else:
                # The model comes with the manifest and nowhere else, so this is
                # where the device list learns what shape of panel this is.
                panels.seen(owner, (stored.get("device") or {}).get("model"))
                count = len(stored.get("widgets", []))
                log.info(
                    "Received a manifest from %s on MQTT describing %d widget types",
                    owner,
                    count,
                )
        elif leaf == "config/current":
            state.applied = self._parse(payload, "applied config")
            log.info("Panel %s reports applied layout: %s", panel_id, state.applied)
        elif leaf == "page":
            state.current_page = payload.strip()
        elif leaf == "lock":
            state.page_locked = payload.strip() == "on"
        elif leaf == "timer":
            # Straight on to the mirror. The panel owns the timer, so this is
            # the truth and the helper follows it.
            ha_timer.mirror.on_panel_timer(panel_id, payload)
        elif leaf == "settings":
            state.overrides = self._parse(payload, "device settings") or {}
            self._adopt_overrides(panel_id, state.overrides)
        elif leaf == "stats":
            state.stats = self._parse(payload, "stats")
            if state.stats:
                # Order matters: the trend is judged against what was already
                # known, before this reading joins the history. The other way
                # round, a lone sample gets compared against itself.
                state.charging = history.charging(panel_id, state.stats.get("voltage"))
                history.record(panel_id, state.stats, state.online)
                self.publish_charging(panel_id, state.charging)
                # The running version arrives here and nowhere else, so this is
                # where the update entity and the device's sw_version learn it.
                self.announce(panel_id)

        if self.on_change:
            self.on_change()

    def _adopt_overrides(self, panel_id: str, overrides: dict[str, Any]) -> None:
        """Write what was changed on the panel into its layout, and push it.

        The push is what ends the override: the firmware drops it the moment a
        layout arrives already carrying the value, and ownership of the setting
        comes back here. Until that happens the panel keeps overruling us, which
        is the intended behaviour and not a fault -- see backend/adopt.py.

        adopt() returns None when the layout already agrees, which is the normal
        case: this topic is retained and replays on every reconnect, and a push
        on every reconnect would be a version bump for nothing.
        """
        try:
            layout = adopt.adopt(panel_id, overrides)
        except Exception as error:  # a bad payload must not cost the link
            log.warning("Could not adopt the settings from %s: %s", panel_id, error)
            return

        if layout is None:
            return

        # Bumped and recorded exactly as /api/push does. Without the bump the
        # firmware's crash guard, which refuses a version it died on, would be
        # looking at a number that never moves.
        layout["version"] = int(layout.get("version", 0)) + 1
        store.save(panel_id, layout)
        if self.publish_layout(panel_id, layout):
            store.record_pushed(panel_id, layout)

        # The Page select in Home Assistant lists the pages that rotate, and
        # this may have just turned one off.
        self.announce(panel_id)

    @staticmethod
    def _parse(payload: str, what: str) -> dict[str, Any] | None:
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            log.warning("Ignoring a %s that is not valid JSON", what)
            return None

    # -- publishing --------------------------------------------------------

    def publish_layout(self, panel_id: str, layout: dict[str, Any]) -> bool:
        """Push a layout to one panel. Retained, so a rebooting device picks it
        straight up.

        Returns whether it reached the broker at all, which is the difference
        between the editor waiting on a device and the editor waiting on itself.
        """
        topic = topics.device(panel_id).config_set
        if not self._publish(topic, json.dumps(layout), retain=True):
            return False
        log.info("Pushed layout version %s to %s", layout.get("version"), panel_id)
        return True

    def publish_state(self, entity_id: str, value: str, attribute: str | None = None) -> None:
        self._publish(topics.state(entity_id, attribute), value, retain=True)

    def publish_command(self, panel_id: str, action: str, **extra: Any) -> None:
        self._publish(
            topics.device(panel_id).command,
            json.dumps({"action": action, **extra}),
            retain=False,
        )

    def publish_images(self, manifest: dict[str, Any]) -> None:
        """Tell every panel which images exist and where to fetch them.

        Shared, like the entity states: the images are the add-on's and the same
        list is true for all of them.

        Retained: a device that reboots, or that was asleep when an image was
        uploaded, picks this up on connect and syncs without being asked.
        """
        self._publish(topics.images_manifest, json.dumps(manifest), retain=True)
        log.info("Published an image manifest listing %d images", len(manifest.get("images", [])))

    def publish_firmware(self, manifest: dict[str, Any]) -> None:
        """The shared offer, for firmware that knows no per-device topic.

        Retained, so a device that was asleep sees it when it wakes.
        """
        self._publish(topics.firmware_manifest, json.dumps(manifest), retain=True)
        if manifest:
            log.info(
                "Offering firmware %s for %s on the shared topic",
                manifest.get("version"),
                manifest.get("model"),
            )

    def publish_firmware_for(self, panel_id: str, manifest: dict[str, Any]) -> None:
        """One panel's offer, which is the one it can actually install."""
        self._publish(
            topics.device(panel_id).firmware_manifest, json.dumps(manifest), retain=True
        )
        if manifest:
            log.info("Offering firmware %s to %s", manifest.get("version"), panel_id)
        else:
            log.info("No firmware build held for %s", panel_id)

    def publish_screenshot(self, panel_id: str, url: str) -> None:
        """Point Home Assistant at the newest screenshot.

        Retained, so the image entity has something to show after a restart of
        Home Assistant rather than a blank card until the next capture.
        """
        self._publish(topics.device(panel_id).screenshot, url, retain=True)

    def publish_charging(self, panel_id: str, charging: bool | None) -> None:
        """Charging is worked out here, so the device is told the answer.

        Retained, so an on-device widget shows the right thing the moment it
        subscribes rather than after the next change.
        """
        if charging is None:
            return
        self._publish(
            topics.device(panel_id).charging, "on" if charging else "off", retain=True
        )

    def publish_raw(self, topic: str, payload: str, retain: bool) -> bool:
        """An arbitrary topic, for discovery.

        Everything else here publishes into the device's own contract, which is
        why those topics are named rather than passed in. Discovery messages go
        to Home Assistant's tree instead, so they need a way round that -- but
        through the same lock and the same connected check.
        """
        return self._publish(topic, payload, retain=retain)

    def _publish(self, topic: str, payload: str, retain: bool) -> bool:
        if not self._client:
            log.warning("Not connected to MQTT, dropping a publish to %s", topic)
            return False
        with self._lock:
            self._client.publish(topic, payload, retain=retain)
        return True


link = DeviceLink()
