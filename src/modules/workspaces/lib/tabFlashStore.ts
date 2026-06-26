import { useSyncExternalStore } from "react";

type Snapshot = { panelId: string | null; seq: number };

let panelId: string | null = null;
let seq = 0;
let snapshot: Snapshot = { panelId, seq };
const listeners = new Set<() => void>();

function notify(): void {
  snapshot = { panelId, seq };
  for (const l of listeners) l();
}

export function flashTab(id: string): void {
  panelId = id;
  seq++;
  notify();
}

export function subscribeTabFlash(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getTabFlashSnapshot(): Snapshot {
  return snapshot;
}

export function useTabFlash(id: string): number {
  const snap = useSyncExternalStore(subscribeTabFlash, getTabFlashSnapshot);
  return snap.panelId === id ? snap.seq : 0;
}
