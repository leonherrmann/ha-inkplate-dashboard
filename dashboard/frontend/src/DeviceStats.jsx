// Device health, read from the retained stats the firmware publishes.

function Battery({ percentage }) {
  return (
    <div className="battery" title={`${percentage}%`}>
      <div className="battery-shell">
        <div className="battery-fill" style={{ width: `${percentage}%` }} />
      </div>
      <div className="battery-cap" />
      <span className="battery-label">{percentage}%</span>
    </div>
  );
}

function formatUptime(seconds) {
  if (!seconds && seconds !== 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// RSSI is roughly -50 excellent to -90 unusable
function signalLabel(rssi) {
  if (rssi === undefined || rssi === null) return "—";
  if (rssi >= -60) return "strong";
  if (rssi >= -70) return "ok";
  if (rssi >= -80) return "weak";
  return "poor";
}

export default function DeviceStats({ online, stats, applied, draftVersion }) {
  const pending = applied && draftVersion > applied.version;

  return (
    <div className="device-stats">
      <div className={`stat status ${online ? "online" : "offline"}`}>
        <span className="dot" />
        {online ? "ONLINE" : "OFFLINE"}
      </div>

      {stats && (
        <>
          <div className="stat">
            <Battery percentage={stats.battery ?? 0} />
          </div>
          <div className="stat">
            <b>{(stats.voltage ?? 0).toFixed(2)}V</b>
            <small>battery</small>
          </div>
          <div className="stat">
            <b>
              {stats.rssi ?? "—"} <small>dBm</small>
            </b>
            <small>wifi {signalLabel(stats.rssi)}</small>
          </div>
          <div className="stat">
            <b>{formatUptime(stats.uptime)}</b>
            <small>uptime</small>
          </div>
          <div className="stat">
            <b>{Math.round((stats.free_heap ?? 0) / 1024)}K</b>
            <small>free heap</small>
          </div>
        </>
      )}

      <div className={`stat version${pending ? " pending" : ""}`}>
        <b>
          v{applied?.version ?? "—"}
          {pending ? ` → ${draftVersion}` : ""}
        </b>
        <small>{pending ? "not pushed" : "layout"}</small>
      </div>
    </div>
  );
}
