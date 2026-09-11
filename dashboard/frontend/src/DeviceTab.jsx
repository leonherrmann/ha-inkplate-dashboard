import { useEffect, useState } from "react";

import SleepSettings from "./SleepSettings.jsx";
import RefreshSettings from "./RefreshSettings.jsx";
import OrientationSettings from "./OrientationSettings.jsx";
import TimerSettings from "./TimerSettings.jsx";
import DeviceReports from "./DeviceReports.jsx";
import Sparkline from "./Sparkline.jsx";
import * as api from "./api.js";
import { Battery, formatAge, formatUptime, signalLabel } from "./DeviceStats.jsx";
import { ORIENTATIONS } from "./OrientationSettings.jsx";
import { TIMER_TICKS } from "./TimerSettings.jsx";
import { REFRESH_LEVELS } from "./RefreshSettings.jsx";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  InfoIcon,
  LockIcon,
  RefreshIcon,
  WarningIcon,
  WifiSetupIcon,
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
        The panel disagrees
      </div>
      <p>
        Buttons on the device set <b>{entries.map((one) => one.text).join(" · ")}</b>, and the panel is still
        overriding what was pushed. Until this clears, the controls here are showing values
        the panel is ignoring.
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


// Everything about the device rather than the layout, in the two screens the
// design draws for it: the settings that take effect on the next push, and the
// diagnostics that describe the panel as it stands.
//
// Diagnostics is reached from a row at the foot of the settings, not from a tab
// strip -- it is a place you go when something is wrong rather than one of four
// equal views, and that is how the design has it on both desktop and phone.

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
  lastSeenAge,
  sleep,
  onSleepChange,
  refresh,
  onRefreshChange,
  orientation,
  onOrientationChange,
  timerTickMs,
  onTimerTickChange,
  pomodoroAutoStart,
  onPomodoroAutoStartChange,
  onRefresh,
  onShowInfo,
  onPush,
}) {
  const [view, setView] = useState("settings");
  const [samples, setSamples] = useState(null);
  const [firmware, setFirmware] = useState(null);
  const [busy, setBusy] = useState("");

  // Confirmed, because it takes the dashboard away until somebody walks to the
  // panel. Nothing is erased -- the wording says so, since "set up again" reads
  // like a factory reset and is not one.
  const sendToSetup = async () => {
    if (
      !window.confirm(
        "The panel will restart and put up its own WiFi network so it can be " +
          "set up again.\n\nIt will stop showing the dashboard until someone " +
          "completes the form on its screen. Nothing is erased: it keeps its " +
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
  // definition, because the add-on only ever holds the latest release.
  const canUpdate =
    Boolean(firmware?.held?.version) && firmware.held.version !== firmware?.device?.running;

  const pageLocked = Boolean(status?.page_locked);

  if (view === "diagnostics") {
    return (
      <div className="screen-layout wide">
        <div className="screen-head">
          <button className="icon-button" onClick={() => setView("settings")} aria-label="Back to Device">
            <ChevronLeft size={15} />
          </button>
          <div>
            <div className="eyebrow">Device</div>
            <h2>Diagnostics</h2>
          </div>
        </div>

        <div className="diagnostics">
          <div className="side-column">
            {/* What the panel says about itself, rather than what the add-on
                can work out from its readings. */}
            <DeviceReports now={status?.server_time} />

            <section className="card">
              <div className="card-head">
                <b>Battery</b>
                <span className={charging ? "badge teal" : "badge"} style={{ marginLeft: "auto" }}>
                  {charging === null || charging === undefined
                    ? "Unknown"
                    : charging
                      ? "Probably charging"
                      : "On battery"}
                </span>
              </div>
              <div className="cycle-total">
                <b style={{ fontSize: 34 }}>{stats?.battery ?? 0} %</b>
                <span>{(stats?.voltage ?? 0).toFixed(2)} V</span>
              </div>
              <div style={{ marginTop: 12 }}>
                <Sparkline samples={samples} />
              </div>
              <p className="hint" style={{ marginTop: 11 }}>
                Read from the voltage trend, so treat it as evidence rather than a measurement
                — a full battery on the cable eventually looks idle.
              </p>
            </section>
          </div>

          <div className="side-column">
            <section className="card">
              <div className="card-head">
                <b>Reported by the panel</b>
                <span className="report-age" style={{ marginLeft: "auto" }}>
                  refreshed every 5 s
                </span>
              </div>
              <div className="facts" style={{ marginTop: 12 }}>
                <Fact label="Firmware" value={firmware?.device?.running || "—"} />
                <Fact label={`WiFi ${signalLabel(stats?.rssi)}`} value={`${stats?.rssi ?? "—"} dBm`} />
                <Fact label="Uptime" value={formatUptime(stats?.uptime)} />
                <Fact
                  label="Images held"
                  value={images ? `${images.cached ?? 0} / ${images.known ?? 0}` : "—"}
                  tone={cachedAll ? "ok" : undefined}
                />
                <Fact label="Applied version" value={status?.applied?.version ?? "—"} />
                <Fact
                  label="Last seen"
                  value={formatAge(lastSeenAge)}
                  tone={status?.online ? "ok" : "bad"}
                />
              </div>

              {images?.error && <p className="hint bad" style={{ marginTop: 10 }}>{images.error}</p>}
              {images && !images.card && (
                <p className="hint" style={{ marginTop: 10 }}>
                  Uploaded images are cached on the panel's SD card. Without one it can show
                  icons built into the firmware, but not uploads.
                </p>
              )}
              {!status?.online && (
                <p className="hint" style={{ marginTop: 10 }}>
                  A device asleep for the night reports offline; that is expected. The time
                  above tells you whether it is still checking in.
                </p>
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <b>Firmware</b>
                {firmware?.held?.version && (
                  <span className="badge violet">{firmware.held.version} held, ready to serve</span>
                )}
                {firmware?.repo && (
                  <>
                    <button
                      style={{ marginLeft: "auto" }}
                      disabled={busy !== ""}
                      onClick={() => runFirmware("check", api.checkFirmware)}
                    >
                      {busy === "check" ? "Checking…" : "Check GitHub now"}
                    </button>
                    <button
                      className={canUpdate ? "primary" : undefined}
                      disabled={!canUpdate || !firmware.servable || busy !== ""}
                      onClick={() => runFirmware("update", api.updateFirmware)}
                    >
                      {busy === "update" ? "Sent…" : "Install on panel"}
                    </button>
                  </>
                )}
              </div>

              {!firmware?.repo ? (
                <p className="hint" style={{ marginTop: 12 }}>
                  Over-the-air updates are off. Set the <code>firmware_repo</code> add-on option
                  to <code>owner/repo</code> and the add-on will watch its releases.
                </p>
              ) : (
                <>
                  <div className="version-row">
                    <span>Running</span>
                    <b>{firmware.device?.running || "—"}</b>
                    <ArrowRight size={16} />
                    <span>Offered</span>
                    <b>{firmware.held?.version || "none"}</b>
                    <span className="spacer">The panel fetches and installs it itself</span>
                  </div>

                  {firmware.held?.error && <p className="hint bad" style={{ marginTop: 10 }}>{firmware.held.error}</p>}
                  {firmware.device?.error && (
                    <p className="hint bad" style={{ marginTop: 10 }}>Device: {firmware.device.error}</p>
                  )}
                  {firmware.uiError && <p className="hint bad" style={{ marginTop: 10 }}>{firmware.uiError}</p>}
                  {firmware.held?.version && !firmware.servable && (
                    <p className="hint bad" style={{ marginTop: 10 }}>
                      The panel has no address to fetch from, so it cannot install this. Set{" "}
                      <code>image_base_url</code> in the add-on options.
                    </p>
                  )}
                  <p className="hint" style={{ marginTop: 10 }}>
                    {canUpdate
                      ? "The panel downloads it, checks the hash and restarts. If the new build cannot boot, the bootloader puts the old one back."
                      : "The panel is running the newest release held here."}
                  </p>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen-layout wide">
      <div className="screen-head">
        <div>
          <div className="eyebrow">Takes effect on push</div>
          <h2>Device</h2>
        </div>
      </div>

      <div className="device-screen">
        <div className="settings-grid">
          <OrientationSettings orientation={orientation} onChange={onOrientationChange} />
          <RefreshSettings refresh={refresh} onChange={onRefreshChange} />
          <SleepSettings sleep={sleep} onChange={onSleepChange} />
          <TimerSettings
            tickMs={timerTickMs}
            onChange={onTimerTickChange}
            autoStart={pomodoroAutoStart}
            onAutoStartChange={onPomodoroAutoStartChange}
          />

          <button className="action-row" onClick={() => setView("diagnostics")}>
            <InfoIcon size={15} />
            Diagnostics &amp; firmware
            {canUpdate && <span className="badge violet">update ready</span>}
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="side-column">
          <DeviceOverrides overrides={status?.overrides} onAdopt={onPush} onPush={onPush} />

          {(status?.current_page || pageLocked) && (
            <section className="card">
              <div className="eyebrow">Owned by the panel</div>
              <div className="owned-list">
                {status?.current_page && (
                  <div>
                    <span className="dot blue" />
                    Showing <b>{status.current_page}</b>
                  </div>
                )}
                {pageLocked && (
                  <div>
                    <span className="dot yellow" />
                    Page locked by a button hold
                  </div>
                )}
              </div>
              <div className="device-entities-warn">
                Read-only here. The lock is released by the same gesture on the panel, and a
                reboot clears it.
              </div>
            </section>
          )}

          {pageLocked && (
            <div className="note warn">
              <div className="note-head">
                <LockIcon size={16} />
                Page locked on the panel
              </div>
              <p>Pinned by a button hold. Released on the panel, not here.</p>
            </div>
          )}

          <section className="card">
            <div className="eyebrow">Commands · sent now</div>
            <div className="group" style={{ gap: 8, marginTop: 12 }}>
              <button className="action-row" onClick={onRefresh}>
                <RefreshIcon size={15} />
                Full refresh
                <small>clears ghosting</small>
              </button>
              <button className="action-row" onClick={onShowInfo}>
                <InfoIcon size={15} />
                Diagnostics on the panel
                <small>for when MQTT is down</small>
              </button>
              <button className="action-row danger" disabled={busy === "onboard"} onClick={sendToSetup}>
                <WifiSetupIcon size={15} />
                Back to WiFi setup
                <small>needs confirming</small>
              </button>
            </div>
            <p className="hint" style={{ marginTop: 12 }}>
              Fire and forget: success means the request went out, not that the panel acted.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
