import { useCallback, useSyncExternalStore } from "react";
import { heldBlockOf, type HeldBlock, type RestoreBlock } from "./restoreStart";

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

// Blocks carried across a hibernation or a close, keyed by the id the tab will have when it comes
// back. Consumed by the first start of that terminal.
const held = new Map<string, HeldBlock>();

export function seedHeldBlock(tabId: string, block: HeldBlock): void {
  held.set(tabId, block);
}

export function consumeHeldBlock(tabId: string): HeldBlock | null {
  const block = held.get(tabId) ?? null;
  held.delete(tabId);
  return block;
}

// The block of the error dialog, mirrored here so a tab that stops can read it without the session.
const modal = new Map<string, RestoreBlock>();

export function setModalBlock(leafId: string, block: RestoreBlock | null): void {
  if (block) modal.set(leafId, block);
  else modal.delete(leafId);
}

// The restore that did not run for this tab, as a stopping tab must carry it.
export function liveHeldBlock(leafId: string): HeldBlock | null {
  return heldBlockOf(modal.get(leafId) ?? null, getPendingRestore(leafId));
}
