import { Battery, formatAge, signalLabel } from "./DeviceStats.jsx";
import { MonitorIcon, PushIcon } from "./Icons.jsx";

// Identity, health, and the one action worth a solid fill, at the top of the
// editor's own column.
//
// This is what the old page-wide header carried. It moved in here because the
// design has no title bar: the facts about the device belong beside the thing
// you are editing onto it, not above the whole application.

export default function DeviceCard({ status, panel, lastSeenAge, sync, onPush, onOpenDevice }) {
  const stats = status?.stats;
  const online = Boolean(status?.online);

  // Saves since the last push. The backend bumps the version on every write, so
  // this is a real count of edits waiting rather than a guess -- but only while
  // the draft is genuinely unpushed, since after a push the two agree.
  const unpushed = status?.draft_pushed
    ? 0
    : Math.max(0, (status?.draft_version ?? 0) - (status?.pushed_version ?? 0));

  return (
    <section className="card device-card">
      <button className="device-ident" onClick={onOpenDevice} title="Open the Device screen">
        <span className="device-mark">
          <MonitorIcon size={17} />
        </span>
        <span>
          <span className="device-name">Inkplate 5</span>
          <span className="device-spec">
            {panel.width} × {panel.height} · 1-bit
          </span>
        </span>
      </button>

      <div className="device-badges">
        <span className={online ? "badge teal" : "badge"}>
          <span className={online ? "dot online" : "dot offline"} />
          {online ? "Online" : "Offline"} {formatAge(lastSeenAge)}
        </span>
        {stats?.battery !== undefined && (
          <span className="badge">
            <Battery percentage={stats.battery ?? 0} charging={status?.charging} />
          </span>
        )}
        {stats?.rssi !== undefined && (
          <span className="badge" title={`WiFi ${signalLabel(stats.rssi)}`}>
            {stats.rssi} dBm
          </span>
        )}
      </div>

      <div className="device-push">
        <span className={`sync ${sync.tone}`} title={sync.detail}>
          {/* The count only means anything in the one state it describes; every
              other state gets the words on their own. */}
          {sync.tone === "pending" && unpushed > 0 ? (
            <>
              <span className="dot yellow" />
              {unpushed} not pushed
            </>
          ) : (
            sync.label
          )}
        </span>

        {/* Solid only when pressing it is what would help. Waiting on a
            sleeping device is not something the button can hurry. */}
        <button className={sync.nudge ? "primary" : undefined} onClick={onPush}>
          <PushIcon size={13} />
          Push
        </button>
      </div>
    </section>
  );
}
