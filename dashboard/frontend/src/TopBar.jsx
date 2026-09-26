import { useRef, useState } from "react";

import { Battery, formatAge, signalLabel } from "./DeviceStats.jsx";
import { CheckIcon, ClockIcon, PushIcon, QuestionIcon, WarningIcon } from "./Icons.jsx";
import PanelPicker from "./PanelPicker.jsx";
import { Popover } from "./Popover.jsx";

// One bar above every screen: which panel, how it is, and whether it is
// showing what is stored here.
//
// This replaces three things that said parts of the same: the device card at
// the head of the editor's column, the panel name above each screen's heading,
// and the sync card on the Device screen. Push was on two of them and the
// state on all three.

const LOOK = {
  pending: { Icon: PushIcon },
  waiting: { Icon: ClockIcon },
  bad: { Icon: WarningIcon },
  ok: { Icon: CheckIcon },
  unknown: { Icon: QuestionIcon },
};

// Push, and the state it resolves. Unpushed edits are the one state pressing
// it helps, so there it is the button itself; every other state is a pill
// that opens what it means, with Push still there for the rare time it is
// wanted anyway.
function SyncPill({ sync, unpushed, onPush, lastSeenAge }) {
  const anchor = useRef(null);
  const [open, setOpen] = useState(false);
  const { Icon } = LOOK[sync.tone] || LOOK.unknown;

  if (sync.tone === "pending") {
    return (
      <button className="primary sync-pill" onClick={onPush} title={sync.detail}>
        <PushIcon size={13} />
        {unpushed > 0 ? `${unpushed} ${unpushed === 1 ? "change" : "changes"} · Push` : "Push"}
      </button>
    );
  }

  const short = {
    ok: "In sync",
    waiting: "Waiting for panel",
    bad: "Panel refused it",
    unknown: "Unknown",
  }[sync.tone] || sync.label;

  return (
    <>
      <button
        ref={anchor}
        className={`sync-pill quiet ${sync.tone}`}
        onClick={() => setOpen((now) => !now)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Icon size={13} width={2.2} />
        {short}
      </button>
      {open && (
        <Popover anchor={anchor} onClose={() => setOpen(false)} className="sync-pop" role="dialog" label={sync.label}>
          <b>{sync.label}</b>
          <p>{sync.detail}</p>
          {/* The refusal reason as text: it is the one thing that says which
              widget is at fault. */}
          {sync.error && <div className="sync-detail">{sync.error}</div>}
          {sync.note && <p className="sync-note">{sync.note}</p>}
          {sync.tone === "ok" && lastSeenAge != null && (
            <p className="sync-note">Confirmed {formatAge(lastSeenAge)}</p>
          )}
          <button
            onClick={() => {
              setOpen(false);
              onPush();
            }}
          >
            <PushIcon size={13} />
            Push again
          </button>
        </Popover>
      )}
    </>
  );
}

export default function TopBar({
  status,
  panels,
  panelId,
  onSelectPanel,
  lastSeenAge,
  sync,
  onPush,
}) {
  const stats = status?.stats;
  const online = Boolean(status?.online);

  // Saves since the last push. The backend bumps the version on every write,
  // so this is a real count -- but only while the draft is unpushed.
  const unpushed = status?.draft_pushed
    ? 0
    : Math.max(0, (status?.draft_version ?? 0) - (status?.pushed_version ?? 0));

  const health = [
    online ? `Online, seen ${formatAge(lastSeenAge)}` : `Offline, last seen ${formatAge(lastSeenAge)}`,
    stats?.rssi !== undefined ? `WiFi ${signalLabel(stats.rssi)} (${stats.rssi} dBm)` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <header className="topbar">
      <PanelPicker
        panels={panels}
        selected={panelId}
        onSelect={onSelectPanel}
      />

      <span className="topbar-health" title={health}>
        <span className={online ? "dot online" : "dot offline"} />
        <span className="topbar-seen">{online ? "Online" : `Offline · ${formatAge(lastSeenAge)}`}</span>
        {stats?.battery !== undefined && (
          <Battery percentage={stats.battery ?? 0} charging={status?.charging} />
        )}
      </span>

      <SyncPill sync={sync} unpushed={unpushed} onPush={onPush} lastSeenAge={lastSeenAge} />
    </header>
  );
}
