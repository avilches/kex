import type { Action } from "./types";

// An app preset is edited like any Action; the moment its name or command differs from what
// Kex installed, Kex stops recognising it (no appId) and the preset is offered again in the
// Add menu, while the icon stays as iconId. Flipping Button does not count. The empty appId is
// what clears it: an update merges over the stored action, and a missing key would keep the old value.
export function ownedAfterEdit(current: Action, next: Action): Action {
  if (current.appId === undefined) return next;
  if (next.name.trim() === current.name && next.command.trim() === current.command) return next;
  return { ...next, appId: "", iconId: current.appId };
}
