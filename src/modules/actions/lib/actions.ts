import { DEFAULT_ACCEPTS, type AppAccepts } from "@/modules/external-editors/catalog";
import { parseIcon } from "./actionIconRefs";
import { isApp, type Action, type ActionKind, type ScriptRuns } from "./types";

const KINDS: readonly ActionKind[] = ["app", "script", "agent"];

const ACCEPTS: readonly AppAccepts[] = ["file", "folder", "both"];

const RUNS: readonly ScriptRuns[] = ["folder", "file", "workspace", "fixed"];

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

// The edit that sets or clears the fixed folder of a script. A cleared folder travels as "" and not as
// undefined: an edit of a workspace Action crosses windows as JSON, which drops undefined keys, and the
// receiver merges the patch over the old Action, so the old folder would survive. normalizeAction reads
// "" as no folder.
export function withFixedCwd(action: Action, raw: string): Action {
  return { ...action, cwd: raw.trim() };
}

// Changing where a script runs. The fixed folder only means something for "fixed", so it is cleared
// for any other place; the patch carries `cwd` either way because the receiver merges it over the
// old Action. "fixed" is not a change the store can take until it has a folder: the modal asks for
// the path first (see `needsFolder`), and this is only called once there is one.
export function withRuns(action: Action, runs: ScriptRuns): Action {
  return { ...action, runs, cwd: runs === "fixed" ? (action.cwd ?? "") : "" };
}

/** Whether picking this place still needs a folder from the user before it can be saved. */
export function needsFolder(runs: ScriptRuns, cwd: string | undefined): boolean {
  return runs === "fixed" && !(cwd ?? "").trim();
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
  if (!KINDS.includes(r.kind as ActionKind)) return null;
  const kind = r.kind as ActionKind;
  // An agent command is typed into a terminal, where a tab would ask the shell to complete: a pasted
  // one is spaces.
  const command = kind === "agent" ? r.command.trim().replace(/\t/g, " ") : r.command.trim();
  const action: Action = {
    id: r.id,
    name: name || command,
    kind,
    command,
    ownButton: kind !== "app" && r.ownButton === true,
  };
  if (typeof r.icon === "string" && parseIcon(r.icon)) action.icon = r.icon;
  if (kind === "app") action.accepts = ACCEPTS.includes(r.accepts as AppAccepts) ? (r.accepts as AppAccepts) : DEFAULT_ACCEPTS;
  if (kind === "script") {
    if (!RUNS.includes(r.runs as ScriptRuns)) return null;
    action.runs = r.runs as ScriptRuns;
    if (action.runs === "fixed") {
      const cwd = typeof r.cwd === "string" ? r.cwd.trim() : "";
      if (!cwd) return null;
      action.cwd = cwd;
    }
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
// a fresh one, so neither version is lost. An app whose command a list app already has is that
// app: the incoming one overwrites it in place (the name is all that can differ), keeping the
// id the list knows. It goes before the Action `beforeId` when the list has it, last otherwise; a
// merged app keeps the place of the one it overwrote.
export function adoptActionAt(
  list: readonly Action[],
  action: Action,
  makeId: () => string,
  beforeId?: string,
): { list: Action[]; stored: Action; merged: boolean } {
  const twin = isApp(action) ? list.find((a) => isApp(a) && a.command.trim() === action.command.trim()) : undefined;
  if (twin) {
    const merged = { ...action, id: twin.id };
    return { list: list.map((a) => (a === twin ? merged : a)), stored: merged, merged: true };
  }
  const stored = list.some((a) => a.id === action.id) ? { ...action, id: makeId() } : action;
  const next = [...list];
  const at = beforeId ? next.findIndex((a) => a.id === beforeId) : -1;
  next.splice(at === -1 ? next.length : at, 0, stored);
  return { list: next, stored, merged: false };
}

// Puts an action back at the place it had, clamped to the list: -1 or a missing place goes last.
export function insertActionAt(list: readonly Action[], action: Action, index: number): Action[] {
  if (list.some((a) => a.id === action.id)) return [...list];
  const next = [...list];
  next.splice(index < 0 || index > next.length ? next.length : index, 0, action);
  return next;
}
