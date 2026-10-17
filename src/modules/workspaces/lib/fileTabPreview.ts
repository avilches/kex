import type { Tab } from "@/modules/workspaces/lib/types";

type FileTab = Extract<Tab, { kind: "editor" | "markdown" }>;

export function isFilePreviewTab(tab: Tab): tab is FileTab {
  return (tab.kind === "editor" || tab.kind === "markdown") && tab.preview === true;
}

export function findReplaceableFilePreview(tabs: readonly Tab[]): FileTab | undefined {
  return tabs.find((t): t is FileTab => isFilePreviewTab(t) && !t.locked);
}
