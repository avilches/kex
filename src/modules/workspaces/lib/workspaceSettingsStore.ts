import { create } from "zustand";

export type WorkspaceSettingsSection = "properties" | "run-configurations";
export type WorkspaceSettingsFocus = "name" | "workspaceRoot";

type WorkspaceSettingsStore = {
  open: boolean;
  workspaceId: string | null;
  initialSection: WorkspaceSettingsSection;
  initialFocus: WorkspaceSettingsFocus;
  openSettings: (id: string, section?: WorkspaceSettingsSection, focus?: WorkspaceSettingsFocus) => void;
  closeSettings: () => void;
};

export const useWorkspaceSettingsStore = create<WorkspaceSettingsStore>((set) => ({
  open: false,
  workspaceId: null,
  initialSection: "properties",
  initialFocus: "name",
  openSettings: (id, section = "properties", focus = "name") =>
    set({ open: true, workspaceId: id, initialSection: section, initialFocus: focus }),
  closeSettings: () => set({ open: false, workspaceId: null }),
}));
