import { useEffect, useState } from "react";

import SleepSettings from "./SleepSettings.jsx";
import Sparkline from "./Sparkline.jsx";
import * as api from "./api.js";
import { Battery, formatAge, formatUptime, signalLabel } from "./DeviceStats.jsx";

// Everything about the device rather than the layout: health, when it was last
// heard from, and the night sleep schedule. Night sleep used to sit in the
// widget palette, which it has nothing to do with.
export default function DeviceTab({ status, lastSeenAge, sleep, onSleepChange, onRefresh }) {
  const [samples, setSamples] = useState(null);

  // Only fetched when this tab is opened; it is not needed to edit a layout
  useEffect(() => {
    api.getHistory().then((data) => setSamples(data.samples)).catch(() => setSamples([]));
  }, []);

  const stats = status?.stats;
  const charging = status?.charging;
  const images = stats?.images;
  const cachedAll = images?.known > 0 && images.cached === images.known;

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

        <SleepSettings sleep={sleep} onChange={onSleepChange} />

        <section className="group">
          <button onClick={onRefresh}>Force a full refresh</button>
          <p className="hint">Redraws the whole panel, clearing any e-ink ghosting.</p>
        </section>
      </div>
    </div>
  );
}
