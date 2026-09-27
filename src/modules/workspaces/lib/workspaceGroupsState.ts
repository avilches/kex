import { debouncedInvoke } from "./debouncedInvoke";
import type { WorkspaceGroup } from "./types";

export function sanitizeSavedGroups(raw: unknown): WorkspaceGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is WorkspaceGroup =>
      item !== null &&
      typeof item === "object" &&
      typeof (item as WorkspaceGroup).id === "string" &&
      typeof (item as WorkspaceGroup).label === "string",
  );
}

let cached: WorkspaceGroup[] = [];

export function setSavedGroups(raw: unknown): void {
  cached = sanitizeSavedGroups(raw);
}

export function getSavedGroups(): WorkspaceGroup[] {
  return cached;
}

const groupsSave = debouncedInvoke<{ label: string; groups: WorkspaceGroup[] }>({
  command: "window_save_groups",
  delayMs: 250,
  buildArgs: ({ label, groups }) => ({ label, groups }),
  errorTag: "workspace-groups-state",
});

export function saveGroups(label: string, groups: WorkspaceGroup[]): void {
  groupsSave.schedule({ label, groups });
}
