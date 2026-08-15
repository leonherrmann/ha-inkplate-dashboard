import { useEffect } from "react";

import SleepSettings from "./SleepSettings.jsx";
import { Battery, formatAge, formatUptime, signalLabel } from "./DeviceStats.jsx";

// Everything about the device rather than the layout: health, when it was last
// heard from, and the night sleep schedule. Night sleep used to sit in the
// widget palette, which it has nothing to do with.
export default function DeviceModal({ status, lastSeenAge, sleep, onSleepChange, onRefresh, onClose }) {
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stats = status?.stats;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal device-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>Device</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
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
            <h3>Health</h3>
            <div className="facts">
              <div className="fact">
                <Battery percentage={stats?.battery ?? 0} />
                <small>battery</small>
              </div>
              <div className="fact">
                <b>{(stats?.voltage ?? 0).toFixed(2)} V</b>
                <small>voltage</small>
              </div>
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
            <h3>Layout</h3>
            <div className="facts">
              <div className="fact">
                <b>v{status?.applied?.version ?? "—"}</b>
                <small>on device</small>
              </div>
              <div className="fact">
                <b>v{status?.draft_version ?? 0}</b>
                <small>draft here</small>
              </div>
            </div>
            {status?.applied && status.draft_version > status.applied.version && (
              <p className="hint">Unpushed changes. Press Push to send them.</p>
            )}
          </section>

          <SleepSettings sleep={sleep} onChange={onSleepChange} />

          <section className="group">
            <button onClick={onRefresh}>Force a full refresh</button>
            <p className="hint">
              Redraws the whole panel, clearing any e-ink ghosting.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
