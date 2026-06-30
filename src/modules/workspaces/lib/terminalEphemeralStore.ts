// Ephemeral per-tab terminal state that must NOT live in the workspaces tree.
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

export function setRunningCommand(tabId: string, cmd: string | null): void {
  if (cmd === null) {
    if (!runningCommands.has(tabId)) return;
    runningCommands.delete(tabId);
  } else {
    if (runningCommands.get(tabId) === cmd) return;
    runningCommands.set(tabId, cmd);
  }
  notify();
}

export function clearRunningCommandEntry(tabId: string): void {
  if (!runningCommands.has(tabId)) return;
  runningCommands.delete(tabId);
  notify();
}

// ── Script running state ──────────────────────────────────────────────────
// "running": command is executing (set by Run button, cleared by OSC 133;D)
// "waiting": stop was requested; waiting for OSC 133;D to confirm termination
// Manual commands typed by the user do NOT touch this map.

export type ScriptState = "running" | "waiting";

const scriptRunning = new Map<string, ScriptState>();
const scriptListeners = new Set<Listener>();
let scriptSnapshot: ReadonlyMap<string, ScriptState> = new Map();

function notifyScript(): void {
  scriptSnapshot = new Map(scriptRunning);
  for (const l of scriptListeners) l();
}

export function subscribeToScriptRunning(listener: Listener): () => void {
  scriptListeners.add(listener);
  return () => { scriptListeners.delete(listener); };
}

export function getScriptRunningSnapshot(): ReadonlyMap<string, ScriptState> {
  return scriptSnapshot;
}

export function setScriptRunning(tabId: string, state: ScriptState | false): void {
  if (state) {
    if (scriptRunning.get(tabId) === state) return;
    scriptRunning.set(tabId, state);
  } else {
    if (!scriptRunning.has(tabId)) return;
    scriptRunning.delete(tabId);
  }
  notifyScript();
}

export function clearScriptRunningEntry(tabId: string): void {
  if (!scriptRunning.has(tabId)) return;
  scriptRunning.delete(tabId);
  notifyScript();
}
