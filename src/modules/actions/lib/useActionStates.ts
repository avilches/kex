import { useSyncExternalStore } from "react";
import {
  getScriptRunningSnapshot,
  subscribeToScriptRunning,
  type ScriptState,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import { actionStates, getActionTabsSnapshot, sameStates, subscribeActionTabs } from "./actionStateStore";

let cached: ReadonlyMap<string, ScriptState> = new Map();
let lastLinks: ReadonlyMap<string, string> | null = null;
let lastMarks: ReadonlyMap<string, ScriptState> | null = null;

// Same reference while neither source changed, and while a change leaves the derived states
// as they were, so a component only re-renders when an Action actually starts or stops.
export function getActionStatesSnapshot(): ReadonlyMap<string, ScriptState> {
  const links = getActionTabsSnapshot();
  const marks = getScriptRunningSnapshot();
  if (links === lastLinks && marks === lastMarks) return cached;
  lastLinks = links;
  lastMarks = marks;
  const next = actionStates(links, marks);
  if (!sameStates(cached, next)) cached = next;
  return cached;
}

function subscribe(listener: () => void): () => void {
  const offTabs = subscribeActionTabs(listener);
  const offMarks = subscribeToScriptRunning(listener);
  return () => {
    offTabs();
    offMarks();
  };
}

/** "running" or "waiting" (stop requested) per Action id; an idle Action is absent. */
export function useActionStates(): ReadonlyMap<string, ScriptState> {
  return useSyncExternalStore(subscribe, getActionStatesSnapshot);
}
