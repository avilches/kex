import { create } from "zustand";

export type WorkspaceSettingsTab = "properties" | "run-configurations";

type WorkspaceSettingsStore = {
  open: boolean;
  workspaceId: string | null;
  initialTab: WorkspaceSettingsTab;
  openSettings: (id: string, tab?: WorkspaceSettingsTab) => void;
  closeSettings: () => void;
};

export const useWorkspaceSettingsStore = create<WorkspaceSettingsStore>((set) => ({
  open: false,
  workspaceId: null,
  initialTab: "properties",
  openSettings: (id, tab = "properties") =>
    set({ open: true, workspaceId: id, initialTab: tab }),
  closeSettings: () => set({ open: false, workspaceId: null }),
}));
