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

export function flashLockIcon(id: string): void {
  panelId = id;
  seq++;
  notify();
}

export function subscribeLockFlash(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getLockFlashSnapshot(): Snapshot {
  return snapshot;
}

export function useLockFlash(id: string): boolean {
  const snap = useSyncExternalStore(subscribeLockFlash, getLockFlashSnapshot);
  return snap.panelId === id;
}
