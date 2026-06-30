import { create } from "zustand";

type FileRenameState = {
  triggerPanelId: string | null;
  trigger: (tabId: string) => void;
  clearTrigger: () => void;
};

export const useFileRenameStore = create<FileRenameState>((set) => ({
  triggerPanelId: null,
  trigger: (tabId) => set({ triggerPanelId: tabId }),
  clearTrigger: () => set({ triggerPanelId: null }),
}));
