import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import { blockedWhileHibernated, isHibernatedTab } from "./hibernate";
import { isPreviewableEditorTab } from "./previewableTab";
import type { Tab } from "./types";

export type ShortcutContext = {
  activeTab: Tab | null;
  hasWorkspaceRoot: boolean;
  scriptCount: number;
};

// Shortcuts that must not fire for the current tab. Used by the global listener.
export function shortcutUnavailable(id: ShortcutId, c: ShortcutContext): boolean {
  if (isHibernatedTab(c.activeTab) && blockedWhileHibernated(id)) return true;
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

// With a palette open, the tab shortcuts it owns act on its highlighted row, so the tab behind
// it cannot make them unavailable.
export function shortcutUnavailableBehindPalette(
  id: ShortcutId,
  c: ShortcutContext,
  palette: { open: boolean; ownsTabShortcut: boolean },
): boolean {
  if (palette.open && palette.ownsTabShortcut) return false;
  return shortcutUnavailable(id, c);
}

// A palette row must look disabled whenever its handler would return without doing anything.
export function paletteShortcutUnavailable(id: ShortcutId, c: ShortcutContext): boolean {
  if (shortcutUnavailable(id, c)) return true;
  if (id === "sidebar.showNotes") return !c.hasWorkspaceRoot;
  if (id === "workspace.run") return c.scriptCount === 0;
  return false;
}

export type HistoryPaletteSignals = {
  activeTab: Tab | null;
  /** The terminal leaf is alive, has shell integration and is not in alt-screen. */
  promptReady: boolean;
  /** Command the shell integration reports as running in that leaf, if any. */
  runningCommand: string | null;
  /** Fresh process-tree check; some agents (omp) fake the shell's OSC 133 prompt
   * markers, which clears the running command, so only this sees them. */
  foregroundProcess?: string | null;
};

// Ctrl+R hands the shell's reverse search to the palette's > history mode. It may only claim
// the key where a command could be typed into the terminal; otherwise the shell keeps it.
export function historyPaletteShortcutUnavailable(s: HistoryPaletteSignals): boolean {
  if (s.activeTab?.kind !== "terminal") return true;
  return !s.promptReady || s.runningCommand !== null || !!s.foregroundProcess;
}
