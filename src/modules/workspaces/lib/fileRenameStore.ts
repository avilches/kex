import { create } from "zustand";

type FileRenameState = {
  triggerTabId: string | null;
  trigger: (tabId: string) => void;
  clearTrigger: () => void;
};

export const useFileRenameStore = create<FileRenameState>((set) => ({
  triggerTabId: null,
  trigger: (tabId) => set({ triggerTabId: tabId }),
  clearTrigger: () => set({ triggerTabId: null }),
}));
