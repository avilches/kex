// Ephemeral per-tab terminal metrics. Lives outside the workspaces tree so
// updating it never produces a new `workspaces` reference (no tree re-render,
// no persistence write). Same pattern as terminalEphemeralStore.ts.
import { useCallback, useSyncExternalStore } from "react";

export type TabMetrics = {
  pid: number;
  cpuPercent: number;
  memBytes: number;
  shellName: string;
  /** First foreground child of the shell; null when nothing is running. */
  foregroundChild: string | null;
};

type Listener = () => void;

const metrics = new Map<string, TabMetrics>();
const tabListeners = new Map<string, Set<Listener>>();

function notifyTab(tabId: string): void {
  const set = tabListeners.get(tabId);
  if (!set) return;
  for (const l of [...set]) l();
}

function subscribeEntry(tabId: string, listener: Listener): () => void {
  let set = tabListeners.get(tabId);
  if (!set) {
    set = new Set();
    tabListeners.set(tabId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) tabListeners.delete(tabId);
  };
}

function getEntrySnapshot(tabId: string): () => TabMetrics | undefined {
  return () => metrics.get(tabId);
}

function sameMetrics(a: TabMetrics | undefined, b: TabMetrics): boolean {
  return (
    a !== undefined &&
    a.pid === b.pid &&
    a.cpuPercent === b.cpuPercent &&
    a.memBytes === b.memBytes &&
    a.shellName === b.shellName &&
    a.foregroundChild === b.foregroundChild
  );
}

export function setMetrics(tabId: string, m: TabMetrics): void {
  setMetricsBatch([[tabId, m]]);
}

export function setMetricsBatch(entries: readonly (readonly [string, TabMetrics])[]): void {
  const changed: string[] = [];
  for (const [tabId, m] of entries) {
    if (sameMetrics(metrics.get(tabId), m)) continue;
    metrics.set(tabId, m);
    changed.push(tabId);
  }
  for (const tabId of changed) notifyTab(tabId);
}

export function clearMetricsEntry(tabId: string): void {
  if (!metrics.has(tabId)) return;
  metrics.delete(tabId);
  notifyTab(tabId);
}

export function useMetrics(tabId: string): TabMetrics | undefined {
  const subscribe = useCallback((l: Listener) => subscribeEntry(tabId, l), [tabId]);
  const getSnapshot = useCallback(getEntrySnapshot(tabId), [tabId]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
