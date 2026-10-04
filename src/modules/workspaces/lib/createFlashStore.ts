import { useSyncExternalStore } from "react";

type Snapshot = { tabId: string | null; seq: number };

// Minimal per-tab "flash" pulse: bumps a sequence number for one tab id so a
// FlashOverlay can key an animation off it. tabFlashStore and lockFlashStore
// each own one independent instance; nothing is shared between them.
export function createFlashStore() {
  let tabId: string | null = null;
  let seq = 0;
  let snapshot: Snapshot = { tabId, seq };
  const listeners = new Set<() => void>();

  function notify(): void {
    snapshot = { tabId, seq };
    for (const l of listeners) l();
  }

  function flash(id: string): void {
    tabId = id;
    seq++;
    notify();
  }

  function subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  }

  function getSnapshot(): Snapshot {
    return snapshot;
  }

  function useFlash(id: string): number {
    const snap = useSyncExternalStore(subscribe, getSnapshot);
    return snap.tabId === id ? snap.seq : 0;
  }

  return { flash, subscribe, getSnapshot, useFlash };
}
