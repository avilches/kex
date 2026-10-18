import type { ScriptCwdMode } from "@/modules/workspaces/lib/types";
import type { Action } from "./types";

const CWD_MODES: readonly ScriptCwdMode[] = ["workspace", "context", "fixed"];

export function addAction(list: readonly Action[], action: Action): Action[] {
  if (list.some((a) => a.id === action.id)) return list as Action[];
  return [...list, action];
}

export function updateAction(
  list: readonly Action[],
  id: string,
  patch: Partial<Omit<Action, "id">>,
): Action[] {
  return list.map((a) => (a.id === id ? { ...a, ...patch, id: a.id } : a));
}

export function removeAction(list: readonly Action[], id: string): Action[] {
  return list.filter((a) => a.id !== id);
}

export function reorderActions(list: readonly Action[], fromId: string, toId: string): Action[] {
  const from = list.findIndex((a) => a.id === fromId);
  const to = list.findIndex((a) => a.id === toId);
  if (from === -1 || to === -1 || from === to) return list as Action[];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function normalizeOne(raw: unknown): Action | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  if (typeof r.command !== "string" || !r.command.trim()) return null;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const runInTerminal = r.runInTerminal === true;
  const action: Action = {
    id: r.id,
    name: name || r.id,
    runInTerminal,
    command: r.command.trim(),
    ownButton: r.ownButton === true,
  };
  if (typeof r.appId === "string" && r.appId) action.appId = r.appId;
  if (runInTerminal && CWD_MODES.includes(r.cwdMode as ScriptCwdMode)) {
    action.cwdMode = r.cwdMode as ScriptCwdMode;
    if (action.cwdMode === "fixed" && typeof r.cwd === "string" && r.cwd) action.cwd = r.cwd;
  }
  return action;
}

// What reaches memory from disk or a form: malformed entries, empty commands and repeated
// ids are dropped, so every consumer can trust the shape.
export function normalizeActions(raw: unknown): Action[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Action[] = [];
  for (const entry of raw) {
    const action = normalizeOne(entry);
    if (!action || seen.has(action.id)) continue;
    seen.add(action.id);
    out.push(action);
  }
  return out;
}

// Moves, never copies: the action leaves the workspace and keeps its id in the global list.
export function promoteToGlobal(
  workspace: readonly Action[],
  global: readonly Action[],
  id: string,
): { workspace: Action[]; global: Action[] } {
  const action = workspace.find((a) => a.id === id);
  if (!action) return { workspace: workspace as Action[], global: global as Action[] };
  return {
    workspace: removeAction(workspace, id),
    global: global.some((a) => a.id === id) ? (global as Action[]) : [...global, action],
  };
}

export type HeaderPartition = {
  ownButtons: Action[];
  scripts: Action[];
  apps: Action[];
};

export function partitionForHeader(actions: readonly Action[]): HeaderPartition {
  const ownButtons: Action[] = [];
  const scripts: Action[] = [];
  const apps: Action[] = [];
  for (const a of actions) {
    if (a.ownButton) ownButtons.push(a);
    else if (a.runInTerminal) scripts.push(a);
    else apps.push(a);
  }
  return { ownButtons, scripts, apps };
}
