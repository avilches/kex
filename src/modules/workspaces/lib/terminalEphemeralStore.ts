// Ephemeral per-panel terminal state that must NOT live in the workspaces tree.
// Updating here does not produce a new `workspaces` reference and therefore
// does not trigger React re-renders of the workspace tree or the persistence effect.

type Listener = () => void;

const runningCommands = new Map<string, string>();
const listeners = new Set<Listener>();
let snapshot: ReadonlyMap<string, string> = new Map();

function notify(): void {
  snapshot = new Map(runningCommands);
  for (const l of listeners) l();
}

export function subscribeToRunningCommands(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getRunningCommandsSnapshot(): ReadonlyMap<string, string> {
  return snapshot;
}

export function setRunningCommand(panelId: string, cmd: string | null): void {
  if (cmd === null) {
    if (!runningCommands.has(panelId)) return;
    runningCommands.delete(panelId);
  } else {
    if (runningCommands.get(panelId) === cmd) return;
    runningCommands.set(panelId, cmd);
  }
  notify();
}

export function clearRunningCommandEntry(panelId: string): void {
  if (!runningCommands.has(panelId)) return;
  runningCommands.delete(panelId);
  notify();
}
