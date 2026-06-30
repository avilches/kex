import { create } from "zustand";

export type WorkspaceSettingsTab = "properties" | "run-configurations";
export type WorkspaceSettingsFocus = "name" | "workspaceRoot";

type WorkspaceSettingsStore = {
  open: boolean;
  workspaceId: string | null;
  initialTab: WorkspaceSettingsTab;
  initialFocus: WorkspaceSettingsFocus;
  openSettings: (id: string, tab?: WorkspaceSettingsTab, focus?: WorkspaceSettingsFocus) => void;
  closeSettings: () => void;
};

export const useWorkspaceSettingsStore = create<WorkspaceSettingsStore>((set) => ({
  open: false,
  workspaceId: null,
  initialTab: "properties",
  initialFocus: "name",
  openSettings: (id, tab = "properties", focus = "name") =>
    set({ open: true, workspaceId: id, initialTab: tab, initialFocus: focus }),
  closeSettings: () => set({ open: false, workspaceId: null }),
}));
