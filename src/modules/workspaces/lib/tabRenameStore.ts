import { create } from "zustand";

// Where the rename field is anchored: the tab in its pane's strip, or its row
// in the WorkspaceBar. Only the surface that matches shows the popover, so a
// rename started from a row never opens a second one on a pane tab that may be
// hidden (inactive workspace, another pane).
export type RenameOrigin = "pane" | "sidebar";

type TabRenameStore = {
  renamingTabId: string | null;
  renamingOrigin: RenameOrigin;
  templatesOpen: boolean;
  startRename: (tabId: string, origin?: RenameOrigin) => void;
  toggleTemplates: () => void;
  clearRename: () => void;
};

export const useTabRenameStore = create<TabRenameStore>((set) => ({
  renamingTabId: null,
  renamingOrigin: "pane",
  templatesOpen: false,
  startRename: (tabId, origin = "pane") =>
    set({ renamingTabId: tabId, renamingOrigin: origin, templatesOpen: false }),
  toggleTemplates: () => set((s) => ({ templatesOpen: !s.templatesOpen })),
  clearRename: () => set({ renamingTabId: null, templatesOpen: false }),
}));

export function isRenamingAt(
  state: Pick<TabRenameStore, "renamingTabId" | "renamingOrigin">,
  tabId: string,
  origin: RenameOrigin,
): boolean {
  return state.renamingTabId === tabId && state.renamingOrigin === origin;
}

export type RenameShortcutAction = "start" | "toggle" | "ignore";

// What a press of the rename shortcut does: the first opens the title field,
// a second one while it is open expands or collapses the templates table.
// Saving stays on Enter, Escape and clicking outside.
export function resolveRenameShortcut(input: {
  renamingTabId: string | null;
  activeTabId: string | null;
  inTextField: boolean;
}): RenameShortcutAction {
  if (input.renamingTabId !== null) return "toggle";
  if (input.inTextField || !input.activeTabId) return "ignore";
  return "start";
}
