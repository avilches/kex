import type { ScriptCwdMode } from "@/modules/workspaces/lib/types";
import type { Action } from "./types";

const CWD_MODES: readonly ScriptCwdMode[] = ["home", "workspace", "context", "fixed"];

// Add and update keep memory equal to what normalizeActions would persist: an action that
// would end up invalid (an empty command) is refused and the list keeps its previous value.
export function addAction(list: readonly Action[], action: Action): Action[] {
  const clean = normalizeAction(action);
  if (!clean || list.some((a) => a.id === clean.id)) return list as Action[];
  return [...list, clean];
}

export function updateAction(
  list: readonly Action[],
  id: string,
  patch: Partial<Omit<Action, "id">>,
): Action[] {
  return list.map((a) => {
    if (a.id !== id) return a;
    // A name cleared in a form keeps the one it had: an unnamed action is labelled by its command.
    const named = "name" in patch && !patch.name?.trim() ? { ...patch, name: a.name } : patch;
    return normalizeAction({ ...a, ...named, id: a.id }) ?? a;
  });
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

// Puts the Action right before `beforeId`, or last without one: a move between the bar and the
// menu, where both ends are not one list the way a reorder is, has no "over" to swap with.
export function reorderBefore(list: readonly Action[], id: string, beforeId?: string): Action[] {
  const item = list.find((a) => a.id === id);
  if (!item || beforeId === id) return list as Action[];
  const rest = list.filter((a) => a.id !== id);
  const at = beforeId ? rest.findIndex((a) => a.id === beforeId) : -1;
  rest.splice(at === -1 ? rest.length : at, 0, item);
  return rest;
}

export function normalizeAction(raw: unknown): Action | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  if (typeof r.command !== "string" || !r.command.trim()) return null;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const runInTerminal = r.runInTerminal === true;
  const command = r.command.trim();
  const action: Action = {
    id: r.id,
    name: name || command,
    runInTerminal,
    command,
    ownButton: r.ownButton === true,
  };
  if (typeof r.appId === "string" && r.appId) action.appId = r.appId;
  if (typeof r.iconId === "string" && r.iconId) action.iconId = r.iconId;
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
    const action = normalizeAction(entry);
    if (!action || seen.has(action.id)) continue;
    seen.add(action.id);
    out.push(action);
  }
  return out;
}

// Adds an action to a list it does not belong to. When its id is already taken there, it gets
// a fresh one, so neither version is lost.
export function adoptAction(list: readonly Action[], action: Action, makeId: () => string): Action[] {
  return adoptActionAt(list, action, makeId).list;
}

// The same, placed before the Action `beforeId` when the list has it, last otherwise.
export function adoptActionAt(
  list: readonly Action[],
  action: Action,
  makeId: () => string,
  beforeId?: string,
): { list: Action[]; stored: Action } {
  const stored = list.some((a) => a.id === action.id) ? { ...action, id: makeId() } : action;
  const next = [...list];
  const at = beforeId ? next.findIndex((a) => a.id === beforeId) : -1;
  next.splice(at === -1 ? next.length : at, 0, stored);
  return { list: next, stored };
}

// Moves, never copies: the action leaves the workspace and joins the global list.
export function promoteToGlobal(
  workspace: readonly Action[],
  global: readonly Action[],
  id: string,
  makeId: () => string,
): { workspace: Action[]; global: Action[] } {
  const action = workspace.find((a) => a.id === id);
  if (!action) return { workspace: workspace as Action[], global: global as Action[] };
  return { workspace: removeAction(workspace, id), global: adoptAction(global, action, makeId) };
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
