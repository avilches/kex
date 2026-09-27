import { create } from "zustand";

// A bumping counter, not a boolean: every workspace/group context menu in the
// WorkspaceBar watches this value and closes itself when it changes, however
// many are open. A boolean couldn't signal a second close request once
// already false.
type ContextMenuCloseStore = {
  signal: number;
  closeAll: () => void;
};

export const useContextMenuCloseStore = create<ContextMenuCloseStore>(
  (set) => ({
    signal: 0,
    closeAll: () => set((s) => ({ signal: s.signal + 1 })),
  }),
);
