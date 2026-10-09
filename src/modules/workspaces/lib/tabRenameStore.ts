import { create } from "zustand";

type TabRenameStore = {
  renamingTabId: string | null;
  saveSeq: number;
  startRename: (tabId: string) => void;
  requestSave: () => void;
  clearRename: () => void;
};

export const useTabRenameStore = create<TabRenameStore>((set) => ({
  renamingTabId: null,
  saveSeq: 0,
  startRename: (tabId) => set({ renamingTabId: tabId }),
  requestSave: () => set((s) => ({ saveSeq: s.saveSeq + 1 })),
  clearRename: () => set({ renamingTabId: null }),
}));

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
