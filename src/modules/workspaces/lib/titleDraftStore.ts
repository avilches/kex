import { useSyncExternalStore } from "react";

// The text being typed in a rename field, keyed by tab or workspace id. The title
// resolvers read it in place of the saved title, so the tab shows the expanded result
// live. It exists only while a rename field is open; cancelling just clears it.
const drafts = new Map<string, string>();
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setTitleDraft(id: string, value: string) {
  if (drafts.get(id) === value) return;
  drafts.set(id, value);
  notify();
}

export function clearTitleDraft(id: string) {
  if (drafts.delete(id)) notify();
}

export function getTitleDraft(id: string | undefined): string | undefined {
  return id === undefined ? undefined : drafts.get(id);
}

// Per-id snapshot of a string: stable while this id's draft does not change, so only
// the tab being renamed re-renders as the user types.
export function useTitleDraft(id: string | undefined): string | undefined {
  return useSyncExternalStore(subscribe, () => getTitleDraft(id));
}

export function withTitleDraft<T extends { title?: string }>(item: T, draft: string | undefined): T {
  return draft === undefined ? item : { ...item, title: draft };
}
