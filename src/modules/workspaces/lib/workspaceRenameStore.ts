import { create } from "zustand";

type WorkspaceRenameStore = {
  renamingId: string | null;
  templatesOpen: boolean;
  startRename: (id: string) => void;
  toggleTemplates: () => void;
  clearRename: () => void;
};

export const useWorkspaceRenameStore = create<WorkspaceRenameStore>((set) => ({
  renamingId: null,
  templatesOpen: false,
  startRename: (id) => set({ renamingId: id, templatesOpen: false }),
  toggleTemplates: () => set((s) => ({ templatesOpen: !s.templatesOpen })),
  clearRename: () => set({ renamingId: null, templatesOpen: false }),
}));
