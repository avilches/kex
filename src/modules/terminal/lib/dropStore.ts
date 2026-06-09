import { create } from "zustand";

type TerminalDropState = {
  targetLeafId: string | null;
  setTarget: (leafId: string | null) => void;
};

export const useTerminalDropStore = create<TerminalDropState>((set) => ({
  targetLeafId: null,
  setTarget: (leafId) =>
    set((s) => (s.targetLeafId === leafId ? s : { targetLeafId: leafId })),
}));
