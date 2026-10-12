import { create } from "zustand";

// Set by the toggle shortcut so the note editor takes focus when it opens,
// but not when a tab with an open note is merely switched to.
type TabNoteStore = {
  focusTabId: string | null;
  requestFocus: (tabId: string) => void;
  clearFocus: () => void;
  // Tab whose WorkspaceBar note icon is hovered and whose note lives in a pane: that pane previews it.
  sidebarHoverTabId: string | null;
  setSidebarHover: (tabId: string | null) => void;
};

export const useTabNoteStore = create<TabNoteStore>((set) => ({
  focusTabId: null,
  requestFocus: (tabId) => set({ focusTabId: tabId }),
  clearFocus: () => set({ focusTabId: null }),
  sidebarHoverTabId: null,
  setSidebarHover: (tabId) => set({ sidebarHoverTabId: tabId }),
}));

// Open note editors keep typing local and write it to the tab on a debounce, so each key
// does not re-render the whole app. Anything that reads tab.note first calls this.
const flushers = new Map<string, () => void>();

export function registerTabNoteFlush(tabId: string, flush: () => void): () => void {
  flushers.set(tabId, flush);
  return () => {
    if (flushers.get(tabId) === flush) flushers.delete(tabId);
  };
}

export function flushTabNote(tabId: string): void {
  flushers.get(tabId)?.();
}
