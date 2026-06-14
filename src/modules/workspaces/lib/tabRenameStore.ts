import { create } from "zustand";

type TabRenameStore = {
  renamingPanelId: string | null;
  startRename: (panelId: string) => void;
  clearRename: () => void;
};

export const useTabRenameStore = create<TabRenameStore>((set) => ({
  renamingPanelId: null,
  startRename: (panelId) => set({ renamingPanelId: panelId }),
  clearRename: () => set({ renamingPanelId: null }),
}));
