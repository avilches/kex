import { createContext, useContext, useMemo, type ReactNode } from "react";
import { focusedTab } from "./lib/splitNode";
import type { TabMoveRequest } from "./lib/tabTransfer";
import type { Workspace } from "./lib/types";
import { workspaceDisplayColor } from "./lib/workspaceColor";
import { workspaceTitleNow } from "./lib/workspaceTitle";

export type WorkspaceMoveTarget = { id: string; title: string; color: string | null; icon?: string };

type WorkspaceMoveValue = {
  targets: WorkspaceMoveTarget[];
  moveTab: (sourceWorkspaceId: string, tabId: string, request: TabMoveRequest) => void | Promise<void>;
};

const WorkspaceMoveContext = createContext<WorkspaceMoveValue>({
  targets: [],
  moveTab: () => {},
});

export function useWorkspaceMove(): WorkspaceMoveValue {
  return useContext(WorkspaceMoveContext);
}

type Props = {
  workspaces: Workspace[];
  onMoveTab: (sourceWorkspaceId: string, tabId: string, request: TabMoveRequest) => void | Promise<void>;
  children: ReactNode;
};

// The targets list only changes when a workspace is added, removed, renamed or
// recolored, so it is memoized on a key instead of on the workspaces array
// (which changes on every cwd update and would re-render every tab).
export function WorkspaceMoveProvider({ workspaces, onMoveTab, children }: Props) {
  const titles = workspaces.map((w) =>
    workspaceTitleNow({ ...w, focusedTab: focusedTab(w.paneTree, w.activePaneId) }),
  );
  const key = workspaces
    .map((w, i) => `${w.id}\u0000${titles[i]}\u0000${workspaceDisplayColor(w) ?? ""}\u0000${w.icon ?? ""}`)
    .join("\u0001");
  // biome-ignore lint/correctness/useExhaustiveDependencies: key captures every field read from workspaces
  const targets = useMemo(
    () =>
      workspaces.map((w, i) => ({
        id: w.id,
        title: titles[i] || "shell",
        color: workspaceDisplayColor(w),
        icon: w.icon,
      })),
    [key],
  );
  const value = useMemo(() => ({ targets, moveTab: onMoveTab }), [targets, onMoveTab]);
  return <WorkspaceMoveContext.Provider value={value}>{children}</WorkspaceMoveContext.Provider>;
}
