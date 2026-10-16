import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import { blockedWhileHibernated } from "./hibernate";
import { isPreviewableEditorTab } from "./previewableTab";
import type { Tab } from "./types";

export type ShortcutContext = {
  hibernated: boolean;
  activeTab: Tab | null;
  hasWorkspaceRoot: boolean;
  scriptCount: number;
};

// Shortcuts that must not fire for the current workspace and tab. Used by the global listener.
export function shortcutUnavailable(id: ShortcutId, c: ShortcutContext): boolean {
  if (c.hibernated && blockedWhileHibernated(id)) return true;
  const kind = c.activeTab?.kind;
  switch (id) {
    case "editor.undo":
    case "editor.redo":
      return kind !== "editor";
    case "editor.cycleView":
      return !(isPreviewableEditorTab(c.activeTab) || kind === "markdown");
    case "markdown.toggleOutline":
      return kind !== "markdown";
    case "editor.preview.toggleSplit":
      return !isPreviewableEditorTab(c.activeTab);
    case "editor.save":
      return kind !== "editor" && kind !== "markdown";
    default:
      return false;
  }
}

// A palette row must look disabled whenever its handler would return without doing anything.
export function paletteShortcutUnavailable(id: ShortcutId, c: ShortcutContext): boolean {
  if (shortcutUnavailable(id, c)) return true;
  if (id === "sidebar.showNotes") return !c.hasWorkspaceRoot;
  if (id === "workspace.run") return c.scriptCount === 0;
  return false;
}
