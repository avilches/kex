export type { Panel, PaneNode, SplitNode, Workspace } from "./lib/types";
export { PaneTabBar } from "./PaneTabBar";
export { PanelContent, type PanelCallbacks } from "./PanelContent";
export { PaneView } from "./PaneView";
export { useWorkspaces, type UseWorkspacesReturn } from "./lib/useWorkspaces";
export { panelTitle, panelIcon } from "./lib/panelTitle";
export { SplitNodeView } from "./SplitNodeView";
export { WorkspaceView } from "./WorkspaceView";
export {
  allPaneIds,
  allPanes,
  findPane,
  findPanelPane,
  firstPaneId,
  siblingPane,
  splitPaneInTree,
  removePaneFromTree,
  updatePane,
  updateDivider,
} from "./lib/splitNode";
