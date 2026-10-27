import { useCallback, useSyncExternalStore } from "react";
import type { RestoreBlock } from "./restoreStart";

// A restore plan that has not run and that the user may still want. Kept apart from
// Session.restoreBlock, which is the modal and goes away when the user opens a plain shell.
const pending = new Map<string, RestoreBlock>();
const listeners = new Map<string, Set<() => void>>();

export function getPendingRestore(leafId: string): RestoreBlock | null {
  return pending.get(leafId) ?? null;
}

export function pendingRestoreLeafIds(): string[] {
  return [...pending.keys()];
}

export function setPendingRestore(leafId: string, block: RestoreBlock | null): void {
  if (block) pending.set(leafId, block);
  else if (!pending.delete(leafId)) return;
  for (const l of listeners.get(leafId) ?? []) l();
}

export function subscribePendingRestore(leafId: string, cb: () => void): () => void {
  let set = listeners.get(leafId);
  if (!set) {
    set = new Set();
    listeners.set(leafId, set);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) listeners.delete(leafId);
  };
}

export function usePendingRestore(leafId: string): RestoreBlock | null {
  return useSyncExternalStore(
    useCallback((cb: () => void) => subscribePendingRestore(leafId, cb), [leafId]),
    () => getPendingRestore(leafId),
  );
}
