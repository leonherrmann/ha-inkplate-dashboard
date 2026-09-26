import { useEffect, useState } from "react";

import SleepSettings from "./SleepSettings.jsx";
import BatterySettings, { DEFAULT_LOW_PERCENT } from "./BatterySettings.jsx";
import RefreshSettings from "./RefreshSettings.jsx";
import OrientationSettings from "./OrientationSettings.jsx";
import TimerSettings from "./TimerSettings.jsx";
import AppearanceSettings, { THEME_LABELS, useThemeChoice } from "./AppearanceSettings.jsx";
import DeviceReports from "./DeviceReports.jsx";
import { MODEL_LABELS } from "./PanelPicker.jsx";
import Sparkline from "./Sparkline.jsx";
import { Setting, SettingsCard } from "./Setting.jsx";
import { Hint } from "./Popover.jsx";
import { useNarrow } from "./useNarrow.js";
import * as api from "./api.js";
import { formatAge, formatUptime, signalLabel } from "./DeviceStats.jsx";
import { ORIENTATIONS } from "./OrientationSettings.jsx";
import { TIMER_TICKS } from "./TimerSettings.jsx";
import { DEFAULT_GHOST_PERCENT as REFRESH_DEFAULT, REFRESH_LEVELS } from "./RefreshSettings.jsx";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  InfoIcon,
  MonitorIcon,
  MoonIcon,
  OrientIcon,
  RefreshIcon,
  TimerIcon,
  WarningIcon,
} from "./Icons.jsx";

// Settings somebody changed with the three buttons on the panel that this
// layout does not agree with.
//
// Normally there are none, and normally there are none within a second of one
// appearing: the panel publishes what it overrode, the add-on writes it into
// the layout and pushes, and the panel drops the override as soon as that
// arrives. So this is not the usual way to see a change made on the panel --
// the settings below are, because by then they carry the panel's own value.
//
// It shows when the two genuinely disagree, which happens if the add-on was
// down when the button was pressed and is still catching up, or if the panel
// is on a newer firmware that sends something this add-on does not understand.
// Without it, the controls below would show a value the panel is quietly
// ignoring, which is the worst of both.
function DeviceOverrides({ overrides, onAdopt, onPush }) {
  const entries = [];
  const set = overrides || {};

  if (set.orientation !== undefined) {
    const match = ORIENTATIONS.find((one) => one.degrees === set.orientation);
    entries.push({ text: `Orientation: ${match ? match.label : `${set.orientation}°`}`, short: match ? match.label : `${set.orientation}°` });
  }
  if (set.ghost_percent !== undefined) {
    const match = REFRESH_LEVELS.find((one) => one.percent === set.ghost_percent);
    entries.push({ text: `screen refresh ${set.ghost_percent} %`, short: `${set.ghost_percent} %` });
  }
  if (set.timer_tick_ms !== undefined) {
    const match = TIMER_TICKS.find((one) => one.ms === set.timer_tick_ms);
    entries.push({
      text: `timer updates ${match ? match.label.toLowerCase() : `every ${set.timer_tick_ms / 1000}s`}`,
      short: `${set.timer_tick_ms / 1000} s`,
    });
  }
  if (set.pomodoro_auto_start !== undefined) {
    entries.push({
      text: `pomodoro auto-start ${set.pomodoro_auto_start ? "on" : "off"}`,
      short: set.pomodoro_auto_start ? "on" : "off",
    });
  }
  if (set.sleep_enabled !== undefined) {
    entries.push({ text: `night sleep ${set.sleep_enabled ? "on" : "off"}`, short: set.sleep_enabled ? "on" : "off" });
  }
  if (set.pages) {
    const off = Object.entries(set.pages)
      .filter(([, queued]) => !queued)
      .map(([id]) => id);
    if (off.length) entries.push({ text: `pages turned off: ${off.join(", ")}`, short: "those pages" });
  }

  if (!entries.length) return null;

  return (
    <div className="note danger">
      <div className="note-head">
        <WarningIcon size={16} />
        Changed on the panel
      </div>
      <p>
        Its buttons set <b>{entries.map((one) => one.text).join(" · ")}</b>. The controls
        here show what was pushed, which the panel is ignoring until this is settled.
      </p>
      <div className="note-actions">
        <button className="btn-tinted" onClick={onAdopt}>
          {/* Named when there is one thing to name, which is the usual case and
              the only one where a value in the button means anything. */}
          {entries.length === 1 ? `Adopt ${entries[0].short}` : "Adopt the panel's"}
        </button>
        <button className="btn-outline" onClick={onPush}>
          Push mine
        </button>
      </div>
    </div>
  );
}


// Everything about the device rather than the layout, as named sections: a
// list of them beside the one that is open on a desktop, and a list that opens
// one at a time on a phone. The sections are what the settings are *about* --
// how it looks, how long it lasts -- rather than one card per control.

const SECTIONS = [
  { id: "display", label: "Display", Icon: OrientIcon, tone: "blue" },
  { id: "power", label: "Power", Icon: MoonIcon, tone: "violet" },
  { id: "timers", label: "Timers", Icon: TimerIcon, tone: "yellow" },
  { id: "panel", label: "Panel actions", Icon: RefreshIcon, tone: "teal" },
  { id: "diagnostics", label: "Diagnostics", Icon: InfoIcon, tone: "" },
  { id: "editor", label: "This editor", Icon: MonitorIcon, tone: "violet" },
];

function SectionRow({ section, value, active, onOpen, badge }) {
  const { Icon, label, tone } = section;
  return (
    <button
      type="button"
      className={active ? "section-row active" : "section-row"}
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
    >
      <span className={`token ${tone}`}>
        <Icon size={15} />
      </span>
      <span className="section-row-text">
        <b>{label}</b>
        <small>{value}</small>
      </span>
      {badge}
      <ChevronRight size={14} />
    </button>
  );
}

function Fact({ value, label, tone }) {
  return (
    <div className="fact">
      <small>{label}</small>
      <b className={tone}>{value}</b>
    </div>
  );
}

export default function DeviceTab({
  status,
  pages,
  sleep,
  onSleepChange,
  battery,
  onBatteryChange,
  refresh,
  onRefreshChange,
  orientation,
  onOrientationChange,
  timerTickMs,
  onTimerTickChange,
  pomodoroAutoStart,
  onPomodoroAutoStartChange,
  lastSeenAge,
  onRefresh,
  onShowInfo,
  onPush,
}) {
  const narrow = useNarrow();
  // The open section. A desktop always has one open; a phone starts on the list.
  const [chosen, setChosen] = useState(null);
  const section = chosen || (narrow ? null : "display");
  const [samples, setSamples] = useState(null);
  const [firmware, setFirmware] = useState(null);
  const [busy, setBusy] = useState("");

  // Confirmed, because it takes the dashboard away until somebody walks to the
  // panel. Nothing is erased -- the wording says so, since "set up again" reads
  // like a factory reset and is not one.
  const sendToSetup = async () => {
    if (
      !window.confirm(
        "The panel will restart into WiFi setup and stop showing the dashboard until " +
          "someone completes the form on its screen.\n\nNothing is erased: it keeps its " +
          "layout and its current network until new details are saved."
      )
    ) {
      return;
    }
    setBusy("onboard");
    try {
      await api.sendToSetup();
    } catch (problem) {
      window.alert(problem.message);
    } finally {
      setBusy("");
    }
  };

  // Only fetched when this screen is opened; it is not needed to edit a layout
  useEffect(() => {
    api.getHistory().then((data) => setSamples(data.samples)).catch(() => setSamples([]));
    loadFirmware();
  }, []);

  // A section opened on a phone starts at the top
  useEffect(() => {
    if (narrow) window.scrollTo({ top: 0 });
  }, [section, narrow]);

  const loadFirmware = () => api.getFirmware().then(setFirmware).catch(() => setFirmware(null));

  const runFirmware = async (what, action) => {
    setBusy(what);
    try {
      await action();
      await loadFirmware();
    } catch (problem) {
      setFirmware((current) => ({ ...(current || {}), uiError: problem.message }));
    } finally {
      setBusy("");
    }
  };

  const stats = status?.stats;
  const charging = status?.charging;
  const images = stats?.images;
  const cachedAll = images?.known > 0 && images.cached === images.known;
  // The device reports what it is running; anything else on offer is newer by
  // definition, because the add-on only ever holds the latest release -- unless
  // it was built for the other panel, which the firmware refuses for itself.
  const wrongModel = firmware?.model_matches === false;
  const canUpdate =
    Boolean(firmware?.held?.version) &&
    firmware.held.version !== firmware?.device?.running &&
    !wrongModel;

  const pageLocked = Boolean(status?.page_locked);
  const showing = (pages || []).find((one) => one.id === status?.current_page);

  // What each section is set to, for its row. Read from the same constants the
  // controls are built from, so a level renamed in one place cannot say
  // something different in the other.
  const orientationLabel =
    ORIENTATIONS.find((one) => one.degrees === Number(orientation ?? 0))?.label || "Upright";
  const refreshPercent = Number(refresh?.ghost_percent ?? REFRESH_DEFAULT);
  const refreshLevel = REFRESH_LEVELS.find((one) => one.percent === refreshPercent);
  const lowPercent = Number(battery?.low_percent ?? DEFAULT_LOW_PERCENT);
  const { choice: themeChoice } = useThemeChoice();
  const timerLabel = TIMER_TICKS.find((one) => one.ms === Number(timerTickMs ?? 5000))?.label ||
    "Every 5 seconds";

  const summaries = {
    display: `${orientationLabel} · ${refreshLevel?.name || `${refreshPercent}%`} refresh`,
    power: [
      sleep?.enabled ? `Sleeps ${sleep.start || "23:00"}–${sleep.end || "06:00"}` : "No night sleep",
      lowPercent ? `warns at ${lowPercent}%` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    timers: `${timerLabel.replace("Every ", "")}${pomodoroAutoStart === false ? " · no auto-start" : ""}`,
    panel: "Refresh, show info, WiFi setup",
    diagnostics: canUpdate ? "Update ready" : firmware?.device?.running || "Screen, log, firmware",
    editor: `${THEME_LABELS[themeChoice]} theme`,
  };

  const content = {
    display: (
      <SettingsCard>
        <OrientationSettings orientation={orientation} onChange={onOrientationChange} />
        <RefreshSettings refresh={refresh} onChange={onRefreshChange} />
      </SettingsCard>
    ),
    power: (
      <>
        <SettingsCard>
          <SleepSettings sleep={sleep} onChange={onSleepChange} />
        </SettingsCard>
        <SettingsCard>
          <BatterySettings battery={battery} onChange={onBatteryChange} />
        </SettingsCard>
      </>
    ),
    timers: (
      <SettingsCard>
        <TimerSettings
          tickMs={timerTickMs}
          onChange={onTimerTickChange}
          autoStart={pomodoroAutoStart}
          onAutoStartChange={onPomodoroAutoStartChange}
        />
      </SettingsCard>
    ),
    // Sent the moment they are pressed rather than on a push
    panel: (
      <SettingsCard>
        <Setting
          title="Full refresh"
          note="Flash the screen now to clear ghosting"
          control={<button onClick={onRefresh}>Refresh</button>}
        />
        <Setting
          title="Diagnostics on the panel"
          note="Its own info screen, for when MQTT is down"
          control={<button onClick={onShowInfo}>Show</button>}
        />
        <Setting
          title="WiFi setup"
          note="Restart into setup to join another network"
          hint="The panel puts up its own WiFi network and a form on its screen. It keeps its layout and its current network until new details are saved."
          control={
            <button className="danger" disabled={busy === "onboard"} onClick={sendToSetup}>
              Start setup…
            </button>
          }
        />
      </SettingsCard>
    ),
    diagnostics: (
      <div className="diagnostics">
        <SettingsCard title="Reported by the panel" wide>
          <div className="facts">
            <Fact label="Firmware" value={firmware?.device?.running || "—"} />
            <Fact label={`WiFi ${signalLabel(stats?.rssi)}`} value={`${stats?.rssi ?? "—"} dBm`} />
            <Fact label="Uptime" value={formatUptime(stats?.uptime)} />
            <Fact
              label="Images held"
              value={images ? `${images.cached ?? 0} / ${images.known ?? 0}` : "—"}
              tone={cachedAll ? "ok" : undefined}
            />
            <Fact
              label={pageLocked ? "Showing · held" : "Showing"}
              value={showing?.name || status?.current_page || "—"}
            />
            <Fact
              label="Last seen"
              value={formatAge(lastSeenAge)}
              tone={status?.online ? "ok" : "bad"}
            />
          </div>
          {images?.error && <p className="hint bad">{images.error}</p>}
          {images && !images.card && (
            <p className="hint">No SD card, so uploaded images cannot be shown.</p>
          )}
          {!status?.online && (
            <p className="hint">A panel asleep for the night reports offline; that is expected.</p>
          )}
        </SettingsCard>

        <SettingsCard title="Battery">
          <div className="cycle-total">
            <b style={{ fontSize: 30 }}>{stats?.battery ?? 0} %</b>
            <span>{(stats?.voltage ?? 0).toFixed(2)} V</span>
            <span className={charging ? "badge teal" : "badge"} style={{ marginLeft: "auto" }}>
              {charging === null || charging === undefined
                ? "Unknown"
                : charging
                  ? "Probably charging"
                  : "On battery"}
              <Hint label="How charging is worked out">
                The board cannot tell whether it is plugged in, so this is read from the
                voltage trend. A full battery on the cable eventually looks idle.
              </Hint>
            </span>
          </div>
          <Sparkline samples={samples} />
        </SettingsCard>

        <SettingsCard title="Firmware">
          {!firmware?.repo ? (
            <p className="hint">
              Updates over the air are off. Set the <code>firmware_repo</code> add-on option to
              turn them on.
            </p>
          ) : (
            <>
              <div className="version-row">
                <span>Running</span>
                <b>{firmware.device?.running || "—"}</b>
                <ArrowRight size={16} />
                <span>Available</span>
                <b>{firmware.held?.version || "none"}</b>
              </div>
              {firmware.held?.error && <p className="hint bad">{firmware.held.error}</p>}
              {firmware.device?.error && <p className="hint bad">Device: {firmware.device.error}</p>}
              {firmware.uiError && <p className="hint bad">{firmware.uiError}</p>}
              {firmware.held?.version && !firmware.servable && (
                <p className="hint bad">
                  The panel has no address to download from. Set <code>image_base_url</code> in
                  the add-on options.
                </p>
              )}
              <p className="hint">
                {wrongModel
                  ? `This release has no build for a ${
                      MODEL_LABELS[firmware.panel_model] || firmware.panel_model
                    }; update it over USB.`
                  : canUpdate
                    ? "The panel downloads it, checks it and restarts. A build that cannot start is rolled back."
                    : "Up to date."}
              </p>
              <div className="group-actions">
                <button
                  className={canUpdate ? "primary" : undefined}
                  disabled={!canUpdate || !firmware.servable || busy !== ""}
                  onClick={() => runFirmware("update", api.updateFirmware)}
                >
                  {busy === "update" ? "Sent…" : "Install on panel"}
                </button>
                <button disabled={busy !== ""} onClick={() => runFirmware("check", api.checkFirmware)}>
                  {busy === "check" ? "Checking…" : "Check for updates"}
                </button>
              </div>
            </>
          )}
        </SettingsCard>

        <SettingsCard wide>
          <DeviceReports now={status?.server_time} />
        </SettingsCard>
      </div>
    ),
    editor: (
      <SettingsCard>
        <AppearanceSettings />
      </SettingsCard>
    ),
  };

  const overrides = (
    <DeviceOverrides overrides={status?.device_overrides} onAdopt={onPush} onPush={onPush} />
  );

  const list = (
    <nav className="card section-list" aria-label="Settings">
      {SECTIONS.map((one) => (
        <SectionRow
          key={one.id}
          section={one}
          value={summaries[one.id]}
          active={!narrow && section === one.id}
          onOpen={() => setChosen(one.id)}
          badge={
            one.id === "diagnostics" && canUpdate ? <span className="badge violet">update</span> : null
          }
        />
      ))}
    </nav>
  );

  const current = SECTIONS.find((one) => one.id === section);

  // A phone: the list, or one section with a way back
  if (narrow) {
    if (!current) {
      return (
        <div className="screen-layout">
          <h2 className="screen-title">Device</h2>
          {overrides}
          {list}
        </div>
      );
    }
    return (
      <div className="screen-layout">
        <button className="back-row" onClick={() => setChosen(null)}>
          <ChevronLeft size={15} />
          Device
        </button>
        <h2 className="screen-title">{current.label}</h2>
        {overrides}
        {content[current.id]}
      </div>
    );
  }

  return (
    <div className="screen-layout wide">
      <h2 className="screen-title">Device</h2>
      <div className="settings-layout">
        {list}
        <div className={section === "diagnostics" ? "settings-detail wide" : "settings-detail"}>
          {/* No heading of its own: the chosen row beside it says which section
              this is, and a heading here set the detail lower than the list. */}
          {overrides}
          {content[current.id]}
        </div>
      </div>
    </div>
  );
}
