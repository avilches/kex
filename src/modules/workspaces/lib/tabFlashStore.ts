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

export function flashTab(id: string): void {
  tabId = id;
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
  return snap.tabId === id ? snap.seq : 0;
}
