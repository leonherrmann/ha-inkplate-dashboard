import { useCallback, useEffect, useRef, useState } from "react";

import * as api from "./api.js";
import { formatAge } from "./DeviceStats.jsx";

// How long to keep looking for what was asked for. A panel busy with an e-ink
// refresh, or one that has just woken, can take several seconds to get to its
// next loop -- but past this it is not coming, and saying so beats a spinner
// that never stops.
const WAIT_MS = 40000;
const POLL_MS = 2000;

// Asking the panel for something and waiting for it to arrive. The request goes
// out over MQTT and the answer comes back over HTTP into a different process, so
// there is nothing to await: the only way to know it landed is to look.
function useAskAndWait(ask, fetchLatest, stampOf) {
  const [held, setHeld] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState(null);
  const timers = useRef([]);

  const stopWaiting = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const load = useCallback(
    async () => {
      try {
        const next = await fetchLatest();
        setHeld(next);
        return next;
      } catch (problem) {
        setError(problem.message);
        return null;
      }
    },
    [fetchLatest]
  );

  useEffect(() => {
    load();
    return stopWaiting;
  }, [load]);

  const request = async () => {
    setError(null);
    const before = stampOf(held);
    try {
      await ask();
    } catch (problem) {
      setError(problem.message);
      return;
    }

    setWaiting(true);
    const deadline = Date.now() + WAIT_MS;

    const poll = async () => {
      const next = await load();
      if (next && stampOf(next) !== before) {
        setWaiting(false);
        return;
      }
      if (Date.now() >= deadline) {
        setWaiting(false);
        setError(
          "The panel did not answer. It may be asleep for the night, off the " +
            "broker, or running a firmware from before this was added."
        );
        return;
      }
      timers.current.push(setTimeout(poll, POLL_MS));
    };

    timers.current.push(setTimeout(poll, POLL_MS));
  };

  return { held, waiting, error, request, reload: load, setHeld };
}

// A picture of what is on the panel, and the panel's own log. Both are asked
// for and neither is automatic: an e-ink dashboard changes slowly, so a capture
// on a timer would mostly be the same picture again, and a log streamed
// continuously is WiFi traffic for a device on a battery.
export default function DeviceReports({ now }) {
  const screenshot = useAskAndWait(
    api.askForScreenshot,
    api.getScreenshot,
    (held) => held?.taken_at || 0
  );
  const logs = useAskAndWait(api.askForLogs, api.getLogs, (held) => held?.received_at || 0);
  const [clearing, setClearing] = useState(false);

  const shot = screenshot.held;
  const log = logs.held;

  // Both timestamps come from the add-on, so a clock skewed on this machine
  // cannot make an age nonsense -- the same reasoning as "last heard from" in
  // the header. Null rather than NaN before the first status has arrived.
  const age = (stamp) => (now && stamp ? Math.max(0, now - stamp) : null);

  const clear = async () => {
    setClearing(true);
    try {
      await api.clearLogs();
      await logs.reload();
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <section className="group">
        <h3>Screen</h3>

        <div className="group-actions">
          <button disabled={screenshot.waiting} onClick={screenshot.request}>
            {screenshot.waiting ? "Waiting for the panel…" : "Take a screenshot"}
          </button>
          {shot?.held && (
            <span className="report-age">taken {formatAge(age(shot.taken_at))}</span>
          )}
        </div>

        {screenshot.error && <p className="hint bad">{screenshot.error}</p>}

        {shot?.held ? (
          <img
            className="screenshot"
            src={api.screenshotUrl(shot.taken_at)}
            alt="What the panel is showing"
            width={shot.width}
            height={shot.height}
          />
        ) : (
          <p className="hint">
            Nothing captured yet. The panel sends the framebuffer it is showing,
            which is the one thing about it none of the readings above can stand
            in for.
          </p>
        )}

        <p className="hint">
          Also a Screen entity in Home Assistant, so a captured picture can go on
          a dashboard there.
        </p>
      </section>

      <section className="group">
        <h3>Log</h3>

        <div className="group-actions">
          <button disabled={logs.waiting} onClick={logs.request}>
            {logs.waiting ? "Waiting for the panel…" : "Ask for the log"}
          </button>
          {log?.bytes > 0 && (
            <>
              <span className="report-age">
                {log.received_at ? `received ${formatAge(age(log.received_at))}` : ""}
              </span>
              <button disabled={clearing} onClick={clear}>
                Clear
              </button>
            </>
          )}
        </div>

        {logs.error && <p className="hint bad">{logs.error}</p>}

        {log?.text ? (
          <pre className="device-log">{log.text}</pre>
        ) : (
          <p className="hint">
            Nothing yet. The panel keeps its last few kilobytes of output and
            sends them when asked — and once on its own after every boot, which
            is the copy worth having: the faults this device has had all happen
            during startup, hours from anyone holding a serial cable.
          </p>
        )}
      </section>
    </>
  );
}
