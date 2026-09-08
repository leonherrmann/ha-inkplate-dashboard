import { useEffect, useState } from "react";

import SleepSettings from "./SleepSettings.jsx";
import RefreshSettings from "./RefreshSettings.jsx";
import OrientationSettings from "./OrientationSettings.jsx";
import DeviceReports from "./DeviceReports.jsx";
import Sparkline from "./Sparkline.jsx";
import * as api from "./api.js";
import { Battery, formatAge, formatUptime, signalLabel } from "./DeviceStats.jsx";
import { ORIENTATIONS } from "./OrientationSettings.jsx";
import { REFRESH_LEVELS } from "./RefreshSettings.jsx";

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
function DeviceOverrides({ overrides }) {
  const entries = [];
  const set = overrides || {};

  if (set.orientation !== undefined) {
    const match = ORIENTATIONS.find((one) => one.degrees === set.orientation);
    entries.push(`Orientation: ${match ? match.label : `${set.orientation}°`}`);
  }
  if (set.ghost_percent !== undefined) {
    const match = REFRESH_LEVELS.find((one) => one.percent === set.ghost_percent);
    entries.push(`Screen refresh: ${match ? match.label : `${set.ghost_percent}%`}`);
  }
  if (set.sleep_enabled !== undefined) {
    entries.push(`Night sleep: ${set.sleep_enabled ? "On" : "Off"}`);
  }
  if (set.pages) {
    const off = Object.entries(set.pages)
      .filter(([, queued]) => !queued)
      .map(([id]) => id);
    if (off.length) entries.push(`Pages turned off: ${off.join(", ")}`);
  }

  if (!entries.length) return null;

  return (
    <div className="banner">
      Set on the panel itself, and not yet in this layout: {entries.join(" · ")}.
      The panel is doing these rather than what is below. Push, and it will hand
      them back.
    </div>
  );
}

// Everything about the device rather than the layout.
//
// This was one very long scroll: eight sections and roughly six hundred words
// of explanation, most of it standing whether or not anything was wrong. It is
// four sub-tabs now, split by what you came here to do rather than by which
// subsystem the fact belongs to -- reading health, changing how the screen
// behaves, updating it, and getting it to tell you what is wrong.
//
// The prose is cut to a line each. What was in those paragraphs was mostly
// contingent -- true only when the device is offline, or has no SD card, or has
// nothing to download -- so it is shown in those states and nowhere else. The
// two explanations that are genuinely load-bearing, because they describe an
// action that is hard to undo, are kept in full on the buttons that do it.

const SUBTABS = [
  { id: "status", label: "Status" },
  { id: "display", label: "Display" },
  { id: "firmware", label: "Firmware" },
  { id: "help", label: "Diagnostics" },
];

function Fact({ value, label, tone }) {
  return (
    <div className="fact">
      <b className={tone}>{value}</b>
      <small>{label}</small>
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
  onRefresh,
  onShowInfo,
}) {
  const [tab, setTab] = useState("status");
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

  // Only fetched when this tab is opened; it is not needed to edit a layout
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

  return (
    <div className="tab-panel device-tab">
      <nav className="tabs subtabs" aria-label="Device sections">
        {SUBTABS.map((entry) => (
          <button
            key={entry.id}
            className={tab === entry.id ? "tab active" : "tab"}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            {/* The one badge worth carrying across tabs: an update waiting is
                the only thing here you would want to know without looking. */}
            {entry.id === "firmware" && canUpdate && <i className="tab-dot" aria-label="update available" />}
          </button>
        ))}
      </nav>

      {tab === "status" && (
        <>
          <section className="card">
            <h2>Connection</h2>
            <div className="facts">
              <Fact
                value={status?.online ? "Online" : "Offline"}
                label="state"
                tone={status?.online ? "ok" : "bad"}
              />
              <Fact value={formatAge(lastSeenAge)} label="last heard from" />
              <Fact value={`${stats?.rssi ?? "—"} dBm`} label={`wifi ${signalLabel(stats?.rssi)}`} />
              <Fact value={formatUptime(stats?.uptime)} label="uptime" />
              <Fact value={`${Math.round((stats?.free_heap ?? 0) / 1024)} K`} label="free heap" />
            </div>
            {!status?.online && (
              <p className="hint">
                A device asleep for the night reports offline. The time above says whether
                it is still checking in.
              </p>
            )}
          </section>

          <section className="card">
            <h2>Battery</h2>
            <div className="facts">
              <div className="fact">
                <Battery percentage={stats?.battery ?? 0} charging={charging} />
                <small>charge</small>
              </div>
              <Fact value={`${(stats?.voltage ?? 0).toFixed(2)} V`} label="voltage" />
              <Fact
                value={
                  charging === null || charging === undefined
                    ? "Unknown"
                    : charging
                      ? "Charging"
                      : "On battery"
                }
                label="power"
                tone={charging ? "ok" : undefined}
              />
            </div>

            <Sparkline samples={samples} />

            {charging === false && (
              <p className="hint">
                Charging is inferred from the voltage rising, so a full battery still on
                the cable reads as on battery.
              </p>
            )}
          </section>

          {/* The panel cannot report on itself, so this is the only place a
              failed download or a missing card is visible. */}
          <section className="card">
            <h2>Images</h2>
            {images ? (
              <>
                <div className="facts">
                  <Fact
                    value={images.card ? "Present" : "Missing"}
                    label="sd card"
                    tone={images.card ? "ok" : "bad"}
                  />
                  <Fact
                    value={`${images.cached ?? 0} / ${images.known ?? 0}`}
                    label="on the card"
                    tone={cachedAll ? "ok" : undefined}
                  />
                  <Fact value={images.loaded ?? 0} label="in memory now" />
                </div>

                {images.error && <p className="hint bad">{images.error}</p>}

                {!images.card && (
                  <p className="hint">
                    Without an SD card the panel can draw icons built into the firmware,
                    but not uploads.
                  </p>
                )}
                {images.card && images.known > 0 && !cachedAll && !images.error && (
                  <p className="hint">Downloading — the device fetches on its next loop.</p>
                )}
                {/* Only a guess, so it says so: nothing loaded is equally what
                    a page with no image on it looks like. */}
                {cachedAll && images.loaded === 0 && !images.error && (
                  <p className="hint">
                    All downloaded, none loaded. Expected if the page on screen has no
                    image on it; otherwise the device could not read one back off the card.
                  </p>
                )}
              </>
            ) : (
              <p className="hint">
                No report yet. A firmware older than the image support does not send one.
              </p>
            )}
          </section>
        </>
      )}

      {tab === "display" && (
        <section className="card">
          <DeviceOverrides overrides={status?.device_overrides} />
          <OrientationSettings orientation={orientation} onChange={onOrientationChange} />
          <RefreshSettings refresh={refresh} onChange={onRefreshChange} />
          <SleepSettings sleep={sleep} onChange={onSleepChange} />
        </section>
      )}

      {tab === "firmware" && (
        <section className="card">
          <h2>Firmware</h2>
          {!firmware?.repo ? (
            <p className="hint">
              Over-the-air updates are off. Set the <code>firmware_repo</code> add-on
              option to <code>owner/repo</code> and the add-on will watch its releases.
            </p>
          ) : (
            <>
              <div className="facts">
                <Fact value={firmware.device?.running || "—"} label="running on the panel" />
                <Fact
                  value={firmware.held?.version || "none"}
                  label="latest release held"
                  tone={canUpdate ? "ok" : undefined}
                />
              </div>

              {firmware.held?.error && <p className="hint bad">{firmware.held.error}</p>}
              {firmware.device?.error && <p className="hint bad">Device: {firmware.device.error}</p>}
              {firmware.uiError && <p className="hint bad">{firmware.uiError}</p>}

              {firmware.held?.version && !firmware.servable && (
                <p className="hint bad">
                  The device has no address to fetch from, so it cannot install this. Set{" "}
                  <code>image_base_url</code> in the add-on options.
                </p>
              )}

              <div className="group-actions">
                <button
                  disabled={busy !== ""}
                  onClick={() => runFirmware("check", api.checkFirmware)}
                >
                  {busy === "check" ? "Checking…" : "Check for a release"}
                </button>
                <button
                  className={canUpdate ? "primary" : undefined}
                  disabled={!canUpdate || !firmware.servable || busy !== ""}
                  onClick={() => runFirmware("update", api.updateFirmware)}
                >
                  {busy === "update" ? "Sent…" : "Install on the panel"}
                </button>
              </div>

              <p className="hint">
                {canUpdate
                  ? "The panel downloads it, checks the hash and restarts. A build that cannot boot is rolled back by the bootloader."
                  : "The panel is running the newest release held here."}
              </p>
            </>
          )}
        </section>
      )}

      {tab === "help" && (
        <>
          {/* What the panel says about itself, rather than what the add-on can
              work out from its readings: a picture of the screen, and its log. */}
          <DeviceReports now={status?.server_time} />

          <section className="card">
            <h2>Actions</h2>

            <div className="action-row">
              <button onClick={onRefresh}>Force a full refresh</button>
              <p className="hint">Redraws the whole panel, clearing any e-ink ghosting.</p>
            </div>

            <div className="action-row">
              <button onClick={onShowInfo}>Show device info on the panel</button>
              <p className="hint">
                Puts the network, broker and firmware details on the screen itself for a
                minute — worth reaching for when the panel is offline and this page has
                nothing to show.
              </p>
            </div>

            <div className="action-row">
              <button disabled={busy !== ""} onClick={sendToSetup}>
                Set this panel up again
              </button>
              <p className="hint">
                Restarts it into its own WiFi network so it can be pointed at a different
                one. Reach for this when the panel is happily connected to a network you no
                longer have: nothing is broken from its point of view, so it will never
                work that out by itself. Its layout and settings are kept.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
