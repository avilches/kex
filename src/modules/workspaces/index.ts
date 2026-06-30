export type { Tab, PaneNode, SplitNode, Workspace } from "./lib/types";
export { PaneTabBar } from "./PaneTabBar";
export { TabContent, type TabCallbacks } from "./TabContent";
export { PaneView } from "./PaneView";
export { collectRunningTerminals, useWorkspaces, type UseWorkspacesReturn } from "./lib/useWorkspaces";
export { tabTitle, tabIcon } from "./lib/tabTitle";
export { SplitNodeView } from "./SplitNodeView";
export { WorkspaceView } from "./WorkspaceView";
export { useWorkspaceDnd } from "./WorkspaceDndProvider";
export {
  allPaneIds,
  allPanes,
  findPane,
  findPaneInDirection,
  findTabPane,
  focusedTabId,
  firstPaneId,
  siblingPane,
  splitPaneInTree,
  removePaneFromTree,
  type Rect,
  updatePane,
  updateDivider,
} from "./lib/splitNode";
