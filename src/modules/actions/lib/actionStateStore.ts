import { useSyncExternalStore } from "react";
import {
  clearScriptRunningEntry,
  type ScriptState,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import { isScript, type Action } from "./types";

// Which tab each script Action last ran in. Runtime only: nothing here is persisted, so a
// restart starts with no links and the first run opens a tab.
const tabs = new Map<string, string>();
const listeners = new Set<() => void>();
let snapshot: ReadonlyMap<string, string> = new Map();

function notify(): void {
  snapshot = new Map(tabs);
  for (const l of listeners) l();
}

export function subscribeActionTabs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActionTabsSnapshot(): ReadonlyMap<string, string> {
  return snapshot;
}

export function getActionTab(actionId: string): string | undefined {
  return tabs.get(actionId);
}

export function linkActionTab(actionId: string, tabId: string): void {
  if (tabs.get(actionId) === tabId) return;
  tabs.set(actionId, tabId);
  notify();
}

export function unlinkActionTab(actionId: string): void {
  if (tabs.delete(actionId)) notify();
}

/** A tab went away: no Action runs in it any more. */
export function unlinkTab(tabId: string): void {
  let changed = false;
  for (const [actionId, linked] of tabs) {
    if (linked === tabId) {
      tabs.delete(actionId);
      changed = true;
    }
  }
  if (changed) notify();
}

/**
 * Actions whose runtime link must go after a change of the list: deleted ones, and ones that
 * switched between script and app (a script's tab means nothing to an app, and the other way).
 */
export function actionsToUnlink(before: readonly Action[], after: readonly Action[]): string[] {
  const now = new Map(after.map((a) => [a.id, a]));
  return before
    .filter((a) => {
      const next = now.get(a.id);
      return !next || next.kind !== a.kind;
    })
    .map((a) => a.id);
}

/**
 * Forgets where the removed or retyped Actions ran, and clears the running mark of a tab no
 * other Action runs in, so a deleted Action does not leave a mark that nothing can stop.
 */
export function unlinkRemovedActions(before: readonly Action[], after: readonly Action[]): void {
  for (const id of actionsToUnlink(before, after)) {
    const tabId = tabs.get(id);
    unlinkActionTab(id);
    if (tabId && !actionForTab(tabId)) clearScriptRunningEntry(tabId);
  }
}

/** The Action whose last run was in this tab. */
export function actionForTab(tabId: string, from: ReadonlyMap<string, string> = tabs): string | undefined {
  for (const [actionId, linked] of from) if (linked === tabId) return actionId;
  return undefined;
}

/** Name and command of the script Action that last ran in this tab, looked up in the given lists. */
export function scriptActionOf(
  tabId: string,
  lists: readonly (readonly Action[])[],
  from: ReadonlyMap<string, string> = tabs,
): { name: string; command: string } | undefined {
  const id = actionForTab(tabId, from);
  if (!id) return undefined;
  for (const list of lists) {
    const action = list.find((a) => a.id === id);
    if (action && isScript(action)) return { name: action.name, command: action.command };
  }
  return undefined;
}

/**
 * Running state of every Action, derived from where each one runs and the per-tab script
 * marks. An Action whose tab is gone or has no mark is idle and absent from the result.
 */
export function actionStates(
  links: ReadonlyMap<string, string>,
  marks: ReadonlyMap<string, ScriptState>,
): ReadonlyMap<string, ScriptState> {
  const out = new Map<string, ScriptState>();
  for (const [actionId, tabId] of links) {
    const mark = marks.get(tabId);
    if (mark) out.set(actionId, mark);
  }
  return out;
}

export function sameStates(a: ReadonlyMap<string, ScriptState>, b: ReadonlyMap<string, ScriptState>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, state] of a) if (b.get(id) !== state) return false;
  return true;
}

export function useActionTabs(): ReadonlyMap<string, string> {
  return useSyncExternalStore(subscribeActionTabs, getActionTabsSnapshot);
}
