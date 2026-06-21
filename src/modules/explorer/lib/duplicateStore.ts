import { useSyncExternalStore } from "react";

export type DuplicateSnapshot = {
  name: string;
  copied: number;
  total: number;
} | null;

let snapshot: DuplicateSnapshot = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function startDuplicate(name: string): void {
  snapshot = { name, copied: 0, total: 0 };
  notify();
}

export function updateDuplicate(copied: number, total: number): void {
  if (!snapshot) return;
  snapshot = { name: snapshot.name, copied, total };
  notify();
}

export function finishDuplicate(): void {
  snapshot = null;
  notify();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot(): DuplicateSnapshot {
  return snapshot;
}

export function useDuplicateProgress(): DuplicateSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot);
}
