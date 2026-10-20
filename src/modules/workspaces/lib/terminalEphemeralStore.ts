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

// Fired with the tab id each time a command ends, which is when what it did to the
// repository (a checkout, a pull) can be read back.
const finishListeners = new Set<(tabId: string) => void>();

export function subscribeToCommandFinished(listener: (tabId: string) => void): () => void {
  finishListeners.add(listener);
  return () => { finishListeners.delete(listener); };
}

function notifyFinished(tabId: string): void {
  for (const l of finishListeners) l(tabId);
}

export function getRunningCommandsSnapshot(): ReadonlyMap<string, string> {
  return snapshot;
}

// Per-tab selector: lets a component subscribe to the whole store's change
// events but only re-render when ITS OWN entry changes, since primitives
// compare by value under useSyncExternalStore (no snapshot map needed).
export function getRunningCommand(tabId: string): string | null {
  return runningCommands.get(tabId) ?? null;
}

export function setRunningCommand(tabId: string, cmd: string | null): void {
  if (cmd === null) {
    if (!runningCommands.has(tabId)) return;
    runningCommands.delete(tabId);
    notify();
    notifyFinished(tabId);
    return;
  }
  if (runningCommands.get(tabId) === cmd) return;
  runningCommands.set(tabId, cmd);
  notify();
}

export function clearRunningCommandEntry(tabId: string): void {
  if (!runningCommands.has(tabId)) return;
  runningCommands.delete(tabId);
  notify();
  notifyFinished(tabId);
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
  scriptCommands.delete(tabId);
  if (!scriptRunning.has(tabId)) return;
  scriptRunning.delete(tabId);
  notifyScript();
}

// The user's own command of the script a tab is running, as the Action template, while
// the shell reports the expanded line it typed; this copy is what the tab shows.
const scriptCommands = new Map<string, string>();

export function setScriptCommand(tabId: string, command: string): void {
  scriptCommands.set(tabId, command);
}

export function getRunningScriptCommand(tabId: string): string | null {
  return scriptRunning.has(tabId) ? (scriptCommands.get(tabId) ?? null) : null;
}
