// Ephemeral per-tab terminal metrics. Lives outside the workspaces tree so
// updating it never produces a new `workspaces` reference (no tree re-render,
// no persistence write). Same pattern as terminalEphemeralStore.ts.
import { useSyncExternalStore } from "react";

export type TabMetrics = {
  pid: number;
  cpuPercent: number;
  memBytes: number;
  shellName: string;
};

type Listener = () => void;

const metrics = new Map<string, TabMetrics>();
const listeners = new Set<Listener>();
let snapshot: ReadonlyMap<string, TabMetrics> = new Map();

function notify(): void {
  snapshot = new Map(metrics);
  for (const l of listeners) l();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ReadonlyMap<string, TabMetrics> {
  return snapshot;
}

function sameMetrics(a: TabMetrics | undefined, b: TabMetrics): boolean {
  return (
    a !== undefined &&
    a.pid === b.pid &&
    a.cpuPercent === b.cpuPercent &&
    a.memBytes === b.memBytes &&
    a.shellName === b.shellName
  );
}

export function setMetrics(tabId: string, m: TabMetrics): void {
  if (sameMetrics(metrics.get(tabId), m)) return;
  metrics.set(tabId, m);
  notify();
}

export function clearMetricsEntry(tabId: string): void {
  if (!metrics.has(tabId)) return;
  metrics.delete(tabId);
  notify();
}

export function useMetrics(tabId: string): TabMetrics | undefined {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  return snap.get(tabId);
}
