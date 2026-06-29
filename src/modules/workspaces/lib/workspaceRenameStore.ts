import { create } from "zustand";

type WorkspaceRenameStore = {
  renamingId: string | null;
  startRename: (id: string) => void;
  clearRename: () => void;
};

export const useWorkspaceRenameStore = create<WorkspaceRenameStore>((set) => ({
  renamingId: null,
  startRename: (id) => set({ renamingId: id }),
  clearRename: () => set({ renamingId: null }),
}));
