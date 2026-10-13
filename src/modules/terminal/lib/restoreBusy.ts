import { useCallback, useSyncExternalStore } from "react";

// Leaves that are retrying a restore. Counted, not boolean, so overlapping retries do not end
// each other's spinner.
const busy = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();

// A retry usually answers in a few milliseconds; below this the spinner would just flicker.
export const MIN_BUSY_MS = 400;

export function isRestoreBusy(leafId: string): boolean {
  return (busy.get(leafId) ?? 0) > 0;
}

function bump(leafId: string, delta: 1 | -1): void {
  const before = isRestoreBusy(leafId);
  const next = (busy.get(leafId) ?? 0) + delta;
  if (next > 0) busy.set(leafId, next);
  else busy.delete(leafId);
  if (before === isRestoreBusy(leafId)) return;
  for (const l of listeners.get(leafId) ?? []) l();
}

export async function withRestoreBusy<T>(
  leafId: string,
  action: () => Promise<T>,
  minMs = MIN_BUSY_MS,
): Promise<T> {
  const started = Date.now();
  bump(leafId, 1);
  try {
    return await action();
  } finally {
    const left = minMs - (Date.now() - started);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    bump(leafId, -1);
  }
}

function subscribe(leafId: string, cb: () => void): () => void {
  let set = listeners.get(leafId);
  if (!set) listeners.set(leafId, (set = new Set()));
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) listeners.delete(leafId);
  };
}

export function useRestoreBusy(leafId: string): boolean {
  return useSyncExternalStore(
    useCallback((cb: () => void) => subscribe(leafId, cb), [leafId]),
    () => isRestoreBusy(leafId),
  );
}
