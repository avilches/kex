import { create } from "zustand";

type BellState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

/** Open state of the notification bell popover, lifted so a global shortcut can toggle it. */
export const useBellStore = create<BellState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
