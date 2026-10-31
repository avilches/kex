import type { Tab } from "./types";

// A file tab (editor or markdown) whose buffer differs from what is on disk.
export function isDirtyDocument(tab: Tab | null | undefined): boolean {
  return !!tab && (tab.kind === "editor" || tab.kind === "markdown") && !!tab.dirty;
}
