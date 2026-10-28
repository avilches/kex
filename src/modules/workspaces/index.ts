export type { Tab, PaneNode, SplitNode, Workspace } from "./lib/types";
export { PaneTabBar } from "./PaneTabBar";
export { TabContent, type MarkdownTabHandle, type TabCallbacks } from "./TabContent";
export { PaneView } from "./PaneView";
export { useWorkspaces, type UseWorkspacesReturn } from "./lib/useWorkspaces";
export {
  flushTabUses,
  loadTabHistory,
  noteTabUse,
  recordTabClosed,
  tabIdentityKey,
  type TabHistoryRecord,
} from "./lib/tabHistory";
export { tabTitle, tabIcon } from "./lib/tabTitle";
export { SplitNodeView } from "./SplitNodeView";
export { WorkspaceView } from "./WorkspaceView";
export { useWorkspaceDnd } from "./WorkspaceDndProvider";
export {
  allPaneIds,
  allPanes,
  findOpenPathTab,
  findPane,
  findPaneInDirection,
  findTabPane,
  focusedTab,
  focusedTabId,
  firstPaneId,
  siblingPane,
  splitPaneInTree,
  removePaneFromTree,
  type Rect,
  updatePane,
  updateDivider,
} from "./lib/splitNode";
export { planDiffTabOpen, type DiffIdentity, type DiffTabPlan } from "./lib/diffTabs";
