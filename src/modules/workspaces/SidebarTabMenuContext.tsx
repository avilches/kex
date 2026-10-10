import { createContext, useContext } from "react";
import type { Tab } from "./lib/types";

// What the context menu of a WorkspaceBar row needs from App. One object whose
// identity never changes (it reads the latest state through refs), so the
// memoized detail list does not re-render when workspaces change. Everything is
// keyed by tab id because the row does not know the pane that holds its tab.
export type SidebarTabMenuActions = {
  paneTabCount: (tabId: string) => number;
  onClose: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseAllTabs: (tabId: string) => void;
  onRenameTab: (tabId: string, title: string | undefined) => void;
  onUpdateTab: (tabId: string, updater: (p: Tab) => Tab) => void;
};

const noop = () => {};

const SidebarTabMenuContext = createContext<SidebarTabMenuActions>({
  paneTabCount: () => 0,
  onClose: noop,
  onCloseOtherTabs: noop,
  onCloseAllTabs: noop,
  onRenameTab: noop,
  onUpdateTab: noop,
});

export const SidebarTabMenuProvider = SidebarTabMenuContext.Provider;

export function useSidebarTabMenu(): SidebarTabMenuActions {
  return useContext(SidebarTabMenuContext);
}
