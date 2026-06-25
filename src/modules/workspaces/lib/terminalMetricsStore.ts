// Ephemeral per-panel terminal metrics. Lives outside the workspaces tree so
// updating it never produces a new `workspaces` reference (no tree re-render,
// no persistence write). Same pattern as terminalEphemeralStore.ts.
import { useSyncExternalStore } from "react";

export type PanelMetrics = {
  pid: number;
  cpuPercent: number;
  memBytes: number;
  shellName: string;
};

type Listener = () => void;

const metrics = new Map<string, PanelMetrics>();
const listeners = new Set<Listener>();
let snapshot: ReadonlyMap<string, PanelMetrics> = new Map();

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

function getSnapshot(): ReadonlyMap<string, PanelMetrics> {
  return snapshot;
}

function sameMetrics(a: PanelMetrics | undefined, b: PanelMetrics): boolean {
  return (
    a !== undefined &&
    a.pid === b.pid &&
    a.cpuPercent === b.cpuPercent &&
    a.memBytes === b.memBytes &&
    a.shellName === b.shellName
  );
}

export function setMetrics(panelId: string, m: PanelMetrics): void {
  if (sameMetrics(metrics.get(panelId), m)) return;
  metrics.set(panelId, m);
  notify();
}

export function clearMetricsEntry(panelId: string): void {
  if (!metrics.has(panelId)) return;
  metrics.delete(panelId);
  notify();
}

export function useMetrics(panelId: string): PanelMetrics | undefined {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  return snap.get(panelId);
}
