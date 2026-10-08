import { create } from "zustand";

export type RenameStep = "title" | "note";

type TabRenameStore = {
  renamingTabId: string | null;
  step: RenameStep;
  saveSeq: number;
  startRename: (tabId: string, step?: RenameStep) => void;
  goToNote: () => void;
  requestSave: () => void;
  clearRename: () => void;
};

export const useTabRenameStore = create<TabRenameStore>((set) => ({
  renamingTabId: null,
  step: "title",
  saveSeq: 0,
  startRename: (tabId, step = "title") => set({ renamingTabId: tabId, step }),
  goToNote: () => set({ step: "note" }),
  requestSave: () => set((s) => ({ saveSeq: s.saveSeq + 1 })),
  clearRename: () => set({ renamingTabId: null, step: "title" }),
}));

export type RenameShortcutAction = "start" | "to-note" | "save" | "ignore";

// What a press of the rename shortcut does: the first opens the title field,
// the second switches the open popover to the note, the third saves and closes.
export function resolveRenameShortcut(input: {
  renamingTabId: string | null;
  step: RenameStep;
  activeTabId: string | null;
  inTextField: boolean;
}): RenameShortcutAction {
  if (input.renamingTabId !== null) return input.step === "title" ? "to-note" : "save";
  if (input.inTextField || !input.activeTabId) return "ignore";
  return "start";
}
