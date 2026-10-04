import { debouncedInvoke } from "./debouncedInvoke";

let cached: string[] = [];

export function setSavedCollapsedGroups(raw: unknown): void {
  cached = Array.isArray(raw) && raw.every((x) => typeof x === "string") ? raw : [];
}

export function getSavedCollapsedGroups(): string[] {
  return cached;
}

const collapsedGroupsSave = debouncedInvoke<{ label: string; ids: string[] }>({
  command: "window_save_collapsed_groups",
  delayMs: 250,
  buildArgs: ({ label, ids }) => ({ label, ids }),
  errorTag: "collapsed-groups-state",
});

export function saveCollapsedGroups(label: string, ids: string[]): void {
  collapsedGroupsSave.schedule({ label, ids });
}
