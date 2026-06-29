import { create } from "zustand";

type WorkspaceSettingsStore = {
  open: boolean;
  workspaceId: string | null;
  initialTab?: "run-configs";
  openSettings: (id: string, tab?: "run-configs") => void;
  closeSettings: () => void;
};

export const useWorkspaceSettingsStore = create<WorkspaceSettingsStore>((set) => ({
  open: false,
  workspaceId: null,
  initialTab: undefined,
  openSettings: (id, tab) => set({ open: true, workspaceId: id, initialTab: tab }),
  closeSettings: () => set({ open: false, workspaceId: null, initialTab: undefined }),
}));
