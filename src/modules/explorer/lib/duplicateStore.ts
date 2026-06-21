import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";

export type DuplicateSnapshot = { name: string; copied: number; total: number } | null;

type ProgressEvent = { name: string; copied: number; total: number; active: boolean };

let snapshot: DuplicateSnapshot = null;
const listeners = new Set<() => void>();
let started = false;

function notify(): void {
  for (const l of listeners) l();
}

export function initDuplicateProgressListener(): void {
  if (started) return;
  started = true;
  void listen<ProgressEvent>("kex:duplicate-progress", (e) => {
    const p = e.payload;
    snapshot = p.active ? { name: p.name, copied: p.copied, total: p.total } : null;
    notify();
  });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot(): DuplicateSnapshot {
  return snapshot;
}

export function isCopying(): boolean {
  return snapshot !== null;
}

export function useDuplicateProgress(): DuplicateSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot);
}
