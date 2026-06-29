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

// ── Run config running state ───────────────────────────────────────────────
// "running": command is executing (set by Run button, cleared by OSC 133;D)
// "waiting": stop was requested; waiting for OSC 133;D to confirm termination
// Manual commands typed by the user do NOT touch this map.

export type RunConfigState = "running" | "waiting";

const runConfigRunning = new Map<string, RunConfigState>();
const rcListeners = new Set<Listener>();
let rcSnapshot: ReadonlyMap<string, RunConfigState> = new Map();

function notifyRc(): void {
  rcSnapshot = new Map(runConfigRunning);
  for (const l of rcListeners) l();
}

export function subscribeToRunConfigRunning(listener: Listener): () => void {
  rcListeners.add(listener);
  return () => { rcListeners.delete(listener); };
}

export function getRunConfigRunningSnapshot(): ReadonlyMap<string, RunConfigState> {
  return rcSnapshot;
}

export function setRunConfigRunning(panelId: string, state: RunConfigState | false): void {
  if (state) {
    if (runConfigRunning.get(panelId) === state) return;
    runConfigRunning.set(panelId, state);
  } else {
    if (!runConfigRunning.has(panelId)) return;
    runConfigRunning.delete(panelId);
  }
  notifyRc();
}

export function clearRunConfigRunningEntry(panelId: string): void {
  if (!runConfigRunning.has(panelId)) return;
  runConfigRunning.delete(panelId);
  notifyRc();
}
