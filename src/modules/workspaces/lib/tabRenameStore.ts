import { create } from "zustand";

type TabRenameStore = {
  renamingTabId: string | null;
  startRename: (tabId: string) => void;
  clearRename: () => void;
};

export const useTabRenameStore = create<TabRenameStore>((set) => ({
  renamingTabId: null,
  startRename: (tabId) => set({ renamingTabId: tabId }),
  clearRename: () => set({ renamingTabId: null }),
}));
