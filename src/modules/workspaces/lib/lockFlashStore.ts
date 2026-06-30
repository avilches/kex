import { useSyncExternalStore } from "react";

type Snapshot = { tabId: string | null; seq: number };

let tabId: string | null = null;
let seq = 0;
let snapshot: Snapshot = { tabId, seq };
const listeners = new Set<() => void>();

function notify(): void {
  snapshot = { tabId, seq };
  for (const l of listeners) l();
}

export function flashLockIcon(id: string): void {
  tabId = id;
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
  return snap.tabId === id;
}
