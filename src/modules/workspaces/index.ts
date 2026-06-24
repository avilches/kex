export type { Panel, PaneNode, SplitNode, Workspace } from "./lib/types";
export { PaneTabBar } from "./PaneTabBar";
export { PanelContent, type PanelCallbacks } from "./PanelContent";
export { PaneView } from "./PaneView";
export { collectRunningTerminals, useWorkspaces, type UseWorkspacesReturn } from "./lib/useWorkspaces";
export { panelTitle, panelIcon } from "./lib/panelTitle";
export { SplitNodeView } from "./SplitNodeView";
export { WorkspaceView } from "./WorkspaceView";
export { useWorkspaceDnd } from "./WorkspaceDndProvider";
export {
  allPaneIds,
  allPanes,
  findPane,
  findPaneInDirection,
  findPanelPane,
  focusedPanelId,
  firstPaneId,
  siblingPane,
  splitPaneInTree,
  removePaneFromTree,
  type Rect,
  updatePane,
  updateDivider,
} from "./lib/splitNode";
