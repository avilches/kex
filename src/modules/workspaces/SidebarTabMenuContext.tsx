import { createContext, type RefObject, useContext, useMemo } from "react";
import { closeIdsForTab, paneTabCountForTab } from "./lib/tabClose";
import type { Tab, Workspace } from "./lib/types";

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
  onSaveTab: (tabId: string) => void;
};

const noop = () => {};

const SidebarTabMenuContext = createContext<SidebarTabMenuActions>({
  paneTabCount: () => 0,
  onClose: noop,
  onCloseOtherTabs: noop,
  onCloseAllTabs: noop,
  onRenameTab: noop,
  onUpdateTab: noop,
  onSaveTab: noop,
});

export const SidebarTabMenuProvider = SidebarTabMenuContext.Provider;

export function useSidebarTabMenu(): SidebarTabMenuActions {
  return useContext(SidebarTabMenuContext);
}

type ActionSources = {
  workspacesRef: RefObject<Pick<Workspace, "paneTree">[]>;
  closeTabsRef: RefObject<(tabIds: string[]) => unknown>;
  saveTabRef: RefObject<(tabId: string) => unknown>;
  tabCallbacksRef: RefObject<{
    onRenameTab?: SidebarTabMenuActions["onRenameTab"];
    onUpdateTab?: SidebarTabMenuActions["onUpdateTab"];
  }>;
};

// Built once: the refs are read at call time, so the identity of the result
// never changes and the memoized rows do not re-render when workspaces do.
export function useSidebarTabMenuActions({
  workspacesRef,
  closeTabsRef,
  saveTabRef,
  tabCallbacksRef,
}: ActionSources): SidebarTabMenuActions {
  return useMemo(() => {
    const closeIds = (tabId: string, mode: "others" | "all") => {
      const ids = closeIdsForTab(workspacesRef.current, tabId, mode);
      if (ids.length) closeTabsRef.current(ids);
    };
    return {
      paneTabCount: (tabId) => paneTabCountForTab(workspacesRef.current, tabId),
      onClose: (tabId) => void closeTabsRef.current([tabId]),
      onCloseOtherTabs: (tabId) => closeIds(tabId, "others"),
      onCloseAllTabs: (tabId) => closeIds(tabId, "all"),
      onSaveTab: (tabId) => void saveTabRef.current(tabId),
      onRenameTab: (tabId, title) => tabCallbacksRef.current.onRenameTab?.(tabId, title),
      onUpdateTab: (tabId, updater) => tabCallbacksRef.current.onUpdateTab?.(tabId, updater),
    };
  }, [workspacesRef, closeTabsRef, saveTabRef, tabCallbacksRef]);
}
