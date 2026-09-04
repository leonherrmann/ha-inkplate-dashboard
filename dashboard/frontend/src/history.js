import { useCallback, useState } from "react";

// Undo over whole layouts rather than over described edits. An edit here is
// already a whole-layout write -- every change funnels through persist() and
// saves the document -- so a snapshot is what there is to keep, and it cannot
// fall out of step with the thing it is meant to reverse the way a hand-written
// inverse for each kind of edit could.
//
// The cost is memory: a snapshot is the layout as JSON, a few kilobytes for a
// dashboard of any realistic size, and this holds at most DEPTH of them.
const DEPTH = 50;

export function useHistory() {
  const [stacks, setStacks] = useState({ past: [], future: [] });

  // Called with the layout as it was *before* the edit. An updater is safe and
  // wanted here: two edits landing in one tick must both be kept, and this
  // returns a value and touches nothing outside itself.
  const record = useCallback((previous) => {
    if (!previous) return;
    setStacks(({ past }) => ({ past: [...past, previous].slice(-DEPTH), future: [] }));
  }, []);

  // Undo and redo read the stacks from state and set a plain value, rather than
  // working inside an updater. An updater that also decided what to return would
  // be impure, and React may call it more than once -- the same trap that made
  // widget edits appear not to take, noted on updateWidgets in App.jsx.
  //
  // Both take the current layout, because it is what goes onto the opposite
  // stack; that is what makes them each other's inverse.
  const undo = useCallback(
    (current) => {
      const { past, future } = stacks;
      if (past.length === 0) return null;
      setStacks({
        past: past.slice(0, -1),
        future: [current, ...future].slice(0, DEPTH),
      });
      return past[past.length - 1];
    },
    [stacks]
  );

  const redo = useCallback(
    (current) => {
      const { past, future } = stacks;
      if (future.length === 0) return null;
      setStacks({
        past: [...past, current].slice(-DEPTH),
        future: future.slice(1),
      });
      return future[0];
    },
    [stacks]
  );

  return {
    record,
    undo,
    redo,
    canUndo: stacks.past.length > 0,
    canRedo: stacks.future.length > 0,
  };
}
