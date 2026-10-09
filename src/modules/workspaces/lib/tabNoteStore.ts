import { create } from "zustand";

// Set by the toggle shortcut so the note editor takes focus when it opens,
// but not when a tab with an open note is merely switched to.
type TabNoteStore = {
  focusTabId: string | null;
  requestFocus: (tabId: string) => void;
  clearFocus: () => void;
};

export const useTabNoteStore = create<TabNoteStore>((set) => ({
  focusTabId: null,
  requestFocus: (tabId) => set({ focusTabId: tabId }),
  clearFocus: () => set({ focusTabId: null }),
}));
