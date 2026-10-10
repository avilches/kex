import { create } from "zustand";

// Where the rename field is anchored: the tab in its pane's strip, or its row
// in the WorkspaceBar. Only the surface that matches shows the popover, so a
// rename started from a row never opens a second one on a pane tab that may be
// hidden (inactive workspace, another pane).
export type RenameOrigin = "pane" | "sidebar";

type TabRenameStore = {
  renamingTabId: string | null;
  renamingOrigin: RenameOrigin;
  saveSeq: number;
  startRename: (tabId: string, origin?: RenameOrigin) => void;
  requestSave: () => void;
  clearRename: () => void;
};

export const useTabRenameStore = create<TabRenameStore>((set) => ({
  renamingTabId: null,
  renamingOrigin: "pane",
  saveSeq: 0,
  startRename: (tabId, origin = "pane") =>
    set({ renamingTabId: tabId, renamingOrigin: origin }),
  requestSave: () => set((s) => ({ saveSeq: s.saveSeq + 1 })),
  clearRename: () => set({ renamingTabId: null }),
}));

export function isRenamingAt(
  state: Pick<TabRenameStore, "renamingTabId" | "renamingOrigin">,
  tabId: string,
  origin: RenameOrigin,
): boolean {
  return state.renamingTabId === tabId && state.renamingOrigin === origin;
}

export type RenameShortcutAction = "start" | "save" | "ignore";

// What a press of the rename shortcut does: the first opens the title field,
// a second one while it is open saves and closes.
export function resolveRenameShortcut(input: {
  renamingTabId: string | null;
  activeTabId: string | null;
  inTextField: boolean;
}): RenameShortcutAction {
  if (input.renamingTabId !== null) return "save";
  if (input.inTextField || !input.activeTabId) return "ignore";
  return "start";
}
