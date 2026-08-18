import { useEffect, useState } from "react";

import { LABELS, MODES, applyMode, readMode, storeMode } from "./theme.js";

// One chip that cycles auto → light → dark. It shows the mode it is in rather
// than the mode it would move to, so the header always reads as a statement
// about the editor; where the click leads is in the tooltip.
export default function ThemeToggle() {
  const [mode, setMode] = useState(readMode);

  useEffect(() => {
    applyMode(mode);
    storeMode(mode);

    // Only "auto" cares that the system changed under it
    if (mode !== "auto") return undefined;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyMode("auto");
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, [mode]);

  const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];

  return (
    <button
      className="chip theme-toggle"
      onClick={() => setMode(next)}
      title={`Theme: ${LABELS[mode].toLowerCase()}. Switch to ${LABELS[next].toLowerCase()}.`}
      aria-label={`Theme: ${LABELS[mode].toLowerCase()}. Switch to ${LABELS[next].toLowerCase()}.`}
    >
      <span className="theme-mark" aria-hidden="true" />
      {LABELS[mode]}
    </button>
  );
}
