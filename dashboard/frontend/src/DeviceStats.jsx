// Device health. The header carries a compact summary; the full set lives in
// the device modal, since none of it is layout editing.

export function formatAge(seconds) {
  if (seconds === null || seconds === undefined) return "never";
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatUptime(seconds) {
  if (seconds === null || seconds === undefined) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// RSSI runs from about -50 excellent to -90 unusable
export function signalLabel(rssi) {
  if (rssi === undefined || rssi === null) return "—";
  if (rssi >= -60) return "strong";
  if (rssi >= -70) return "ok";
  if (rssi >= -80) return "weak";
  return "poor";
}

export function Battery({ percentage, charging }) {
  return (
    <span
      className={charging ? "battery charging" : "battery"}
      title={charging ? `${percentage}%, charging` : `${percentage}%`}
    >
      <span className="battery-shell">
        <span className="battery-fill" style={{ width: `${percentage}%` }} />
        {charging && <span className="battery-bolt" aria-label="charging" />}
      </span>
      <span className="battery-cap" />
      <b>{percentage}%</b>
    </span>
  );
}

// Compact header summary: is it there, how full is it, when did we last hear it
export default function DeviceSummary({ online, stats, charging, lastSeenAge, onOpen }) {
  return (
    <button className="device-summary" onClick={onOpen}>
      <span className={online ? "dot online" : "dot offline"} />
      <span className="device-summary-state">{online ? "ONLINE" : "OFFLINE"}</span>
      {stats && <Battery percentage={stats.battery ?? 0} charging={charging} />}
      <span className="device-summary-seen">{formatAge(lastSeenAge)}</span>
    </button>
  );
}
