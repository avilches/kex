import { create } from "zustand";

type WorkspaceSettingsStore = {
  open: boolean;
  workspaceId: string | null;
  openSettings: (id: string) => void;
  closeSettings: () => void;
};

export const useWorkspaceSettingsStore = create<WorkspaceSettingsStore>((set) => ({
  open: false,
  workspaceId: null,
  openSettings: (id) => set({ open: true, workspaceId: id }),
  closeSettings: () => set({ open: false, workspaceId: null }),
}));
