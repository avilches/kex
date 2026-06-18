import { create } from "zustand";

type FileRenameState = {
  triggerPanelId: string | null;
  trigger: (panelId: string) => void;
  clearTrigger: () => void;
};

export const useFileRenameStore = create<FileRenameState>((set) => ({
  triggerPanelId: null,
  trigger: (panelId) => set({ triggerPanelId: panelId }),
  clearTrigger: () => set({ triggerPanelId: null }),
}));
