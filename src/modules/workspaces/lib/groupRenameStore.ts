import { create } from "zustand";

type GroupRenameStore = {
  renamingId: string | null;
  startRename: (id: string) => void;
  clearRename: () => void;
};

export const useGroupRenameStore = create<GroupRenameStore>((set) => ({
  renamingId: null,
  startRename: (id) => set({ renamingId: id }),
  clearRename: () => set({ renamingId: null }),
}));
