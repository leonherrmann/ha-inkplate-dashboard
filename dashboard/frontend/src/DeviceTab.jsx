import { useEffect, useState } from "react";

import SleepSettings from "./SleepSettings.jsx";
import RefreshSettings from "./RefreshSettings.jsx";
import DeviceReports from "./DeviceReports.jsx";
import Sparkline from "./Sparkline.jsx";
import * as api from "./api.js";
import { Battery, formatAge, formatUptime, signalLabel } from "./DeviceStats.jsx";

// Everything about the device rather than the layout: health, when it was last
// heard from, and the night sleep schedule. Night sleep used to sit in the
// widget palette, which it has nothing to do with.
export default function DeviceTab({
  status,
  lastSeenAge,
  sleep,
  onSleepChange,
  refresh,
  onRefreshChange,
  onRefresh,
  onShowInfo,
}) {
  const [samples, setSamples] = useState(null);
  const [firmware, setFirmware] = useState(null);
  const [busy, setBusy] = useState("");

  // Confirmed, because it takes the dashboard away until somebody walks to the
  // panel. Nothing is erased -- the wording says so, since "set up again" reads
  // like a factory reset and is not one.
  const sendToSetup = async () => {
    if (!window.confirm(
      "The panel will restart and put up its own WiFi network so it can be " +
      "set up again.\n\nIt will stop showing the dashboard until someone " +
      "completes the form on its screen. Nothing is erased: it keeps its " +
      "layout and its current network until new details are saved."
    )) {
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

  const loadFirmware = () =>
    api.getFirmware().then(setFirmware).catch(() => setFirmware(null));

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
    Boolean(firmware?.held?.version) &&
    firmware.held.version !== firmware?.device?.running;

  return (
    <div className="tab-panel">
      <div className="card">
          <section className="group">
            <h3>Connection</h3>
            <div className="facts">
              <div className="fact">
                <b className={status?.online ? "ok" : "bad"}>
                  {status?.online ? "Online" : "Offline"}
                </b>
                <small>state</small>
              </div>
              <div className="fact">
                <b>{formatAge(lastSeenAge)}</b>
                <small>last heard from</small>
              </div>
              <div className="fact">
                <b>{stats?.rssi ?? "—"} dBm</b>
                <small>wifi {signalLabel(stats?.rssi)}</small>
              </div>
            </div>
            {!status?.online && (
              <p className="hint">
                A device asleep for the night reports offline; that is expected. The time
                above tells you whether it is still checking in.
              </p>
            )}
          </section>

          <section className="group">
            <h3>Battery</h3>
            <div className="facts">
              <div className="fact">
                <Battery percentage={stats?.battery ?? 0} charging={charging} />
                <small>charge</small>
              </div>
              <div className="fact">
                <b>{(stats?.voltage ?? 0).toFixed(2)} V</b>
                <small>voltage</small>
              </div>
              <div className="fact">
                <b className={charging ? "ok" : undefined}>
                  {charging === null || charging === undefined
                    ? "Unknown"
                    : charging
                      ? "Charging"
                      : "On battery"}
                </b>
                <small>power</small>
              </div>
            </div>

            <Sparkline samples={samples} />

            {charging === false && (
              <p className="hint">
                Charging is inferred from the voltage rising. A full battery still on the
                cable levels off, so it reads as on battery.
              </p>
            )}
          </section>

          {/* The panel cannot report on itself, so this is the only place a
              failed download or a missing card is visible. */}
          <section className="group">
            <h3>Images</h3>
            {images ? (
              <>
                <div className="facts">
                  <div className="fact">
                    <b className={images.card ? "ok" : "bad"}>
                      {images.card ? "Present" : "Missing"}
                    </b>
                    <small>sd card</small>
                  </div>
                  <div className="fact">
                    <b className={cachedAll ? "ok" : undefined}>
                      {images.cached ?? 0} / {images.known ?? 0}
                    </b>
                    <small>on the card</small>
                  </div>
                  <div className="fact">
                    <b>{images.loaded ?? 0}</b>
                    <small>in memory now</small>
                  </div>
                </div>

                {images.error && <p className="hint bad">{images.error}</p>}

                {!images.card && (
                  <p className="hint">
                    Uploaded images are cached on the device's SD card. Without one the
                    panel can show icons built into the firmware, but not uploads.
                  </p>
                )}
                {images.card && images.known === 0 && (
                  <p className="hint">
                    The device has not been told about any images yet. It picks that up
                    from the add-on when it connects.
                  </p>
                )}
                {images.card && images.known > 0 && !cachedAll && !images.error && (
                  <p className="hint">
                    Downloading. The device fetches on its next loop, within a few seconds
                    of connecting.
                  </p>
                )}
                {/* Only a guess, so it says so: nothing loaded is equally what a
                    page with no image on it looks like. */}
                {cachedAll && images.loaded === 0 && !images.error && (
                  <p className="hint">
                    All downloaded, none loaded. Expected if the page on screen has no
                    image on it; otherwise the device could not read one back off the
                    card.
                  </p>
                )}
              </>
            ) : (
              <p className="hint">
                No report yet. Devices running a firmware older than the image support do
                not send one.
              </p>
            )}
          </section>

          <section className="group">
            <h3>System</h3>
            <div className="facts">
              <div className="fact">
                <b>{formatUptime(stats?.uptime)}</b>
                <small>uptime</small>
              </div>
              <div className="fact">
                <b>{Math.round((stats?.free_heap ?? 0) / 1024)} K</b>
                <small>free heap</small>
              </div>
            </div>
          </section>

          <section className="group">
            <h3>Firmware</h3>
            {!firmware?.repo ? (
              <p className="hint">
                Over-the-air updates are off. Set the <code>firmware_repo</code> add-on
                option to <code>owner/repo</code> and the add-on will watch its releases.
              </p>
            ) : (
              <>
                <div className="facts">
                  <div className="fact">
                    <b>{firmware.device?.running || "—"}</b>
                    <small>running on the panel</small>
                  </div>
                  <div className="fact">
                    <b className={canUpdate ? "ok" : undefined}>
                      {firmware.held?.version || "none"}
                    </b>
                    <small>latest release held</small>
                  </div>
                </div>

                {firmware.held?.error && <p className="hint bad">{firmware.held.error}</p>}
                {firmware.device?.error && (
                  <p className="hint bad">Device: {firmware.device.error}</p>
                )}
                {firmware.uiError && <p className="hint bad">{firmware.uiError}</p>}

                {firmware.held?.version && !firmware.servable && (
                  <p className="hint bad">
                    The device has no address to fetch from, so it cannot install this.
                    Set <code>image_base_url</code> in the add-on options.
                  </p>
                )}

                <div className="group-actions">
                  <button disabled={busy !== ""} onClick={() => runFirmware("check", api.checkFirmware)}>
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
                    ? "The panel downloads it, checks the hash and restarts. If the new build cannot boot, the bootloader puts the old one back."
                    : "The panel is running the newest release held here."}
                </p>
              </>
            )}
          </section>

        {/* What the panel says about itself, rather than what the add-on can
            work out from its readings: a picture of the screen, and its log. */}
        <DeviceReports now={status?.server_time} />

        <SleepSettings sleep={sleep} onChange={onSleepChange} />

        <RefreshSettings refresh={refresh} onChange={onRefreshChange} />

        <section className="group">
          <button onClick={onRefresh}>Force a full refresh</button>
          <p className="hint">Redraws the whole panel, clearing any e-ink ghosting.</p>

          <button disabled={busy !== ""} onClick={sendToSetup}>
            Set this panel up again
          </button>
          <p className="hint">
            Restarts it into its own WiFi network so it can be pointed at a
            different one — after moving, or replacing a router. Reach for this
            when the panel is happily connected to a network you no longer have:
            nothing is broken from its point of view, so it will never work that
            out by itself. Its layout and current settings are kept until the
            setup form is completed.
          </p>

          <button onClick={onShowInfo}>Show device info on the panel</button>
          <p className="hint">
            Puts the device's network, broker and firmware details on the screen
            itself for a minute. Worth reaching for when the panel is offline and
            this page has nothing to show — the device can still say why on its
            own screen.
          </p>
        </section>
      </div>
    </div>
  );
}
