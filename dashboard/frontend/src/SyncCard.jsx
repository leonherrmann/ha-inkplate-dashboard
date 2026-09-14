import {
  CheckIcon,
  ClockIcon,
  PushIcon,
  QuestionIcon,
  WarningIcon,
} from "./Icons.jsx";

// What the panel is showing against what is stored here -- design 1h.
//
// Five facts that call for five different responses, which is the whole reason
// this is a card rather than a word. The badge in the editor's device card says
// which state it is; this says what it means and what, if anything, to do.
//
// The distinction that earns the card on its own: "changes not pushed" and
// "awaiting the device" both mean the panel is not showing your edits, and they
// call for opposite responses. One is answered by pressing Push. The other
// cannot be hurried at all -- the panel is asleep and will collect the layout
// when it wakes -- so the card says so in as many words rather than leaving a
// live Push button implying otherwise.

const LOOK = {
  pending: { tone: "yellow", Icon: PushIcon },
  waiting: { tone: "violet", Icon: ClockIcon },
  bad: { tone: "red", Icon: WarningIcon },
  ok: { tone: "teal", Icon: CheckIcon },
  unknown: { tone: "", Icon: QuestionIcon },
};

export default function SyncCard({ sync, lastSeenAge, onPush }) {
  const { tone, Icon } = LOOK[sync.tone] || LOOK.unknown;

  return (
    <section className={`card sync-card ${sync.tone}`}>
      <span className={`token ${tone}`}>
        <Icon size={18} width={2} />
      </span>

      <div>
        <b>{sync.label}</b>
        <p>{sync.detail}</p>

        {/* The refusal reason as text. It was only ever a tooltip before, which
            is no use on a phone and no use to anyone not hovering the one badge
            that carried it. The firmware sends a bare string -- no widget id --
            so there is nothing to offer a "show me" button against. */}
        {sync.error && <div className="sync-detail">{sync.error}</div>}
      </div>

      {sync.nudge ? (
        <button className="primary" onClick={onPush}>
          <PushIcon size={13} />
          Push now
        </button>
      ) : (
        <div className="sync-foot">
          {sync.note ||
            (sync.tone === "ok" && lastSeenAge != null
              ? `Confirmed ${lastSeenAge < 60 ? `${Math.max(0, Math.round(lastSeenAge))} s` : "a while"} ago`
              : null)}
        </div>
      )}
    </section>
  );
}
