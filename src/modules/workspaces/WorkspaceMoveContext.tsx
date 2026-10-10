import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { TabMoveRequest } from "./lib/tabTransfer";
import type { Workspace } from "./lib/types";
import { resolveWorkspaceColor } from "./lib/workspaceColor";

export type WorkspaceMoveTarget = { id: string; title: string; color: string | null };

type WorkspaceMoveValue = {
  targets: WorkspaceMoveTarget[];
  moveTab: (sourceWorkspaceId: string, tabId: string, request: TabMoveRequest) => void;
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
  onMoveTab: (sourceWorkspaceId: string, tabId: string, request: TabMoveRequest) => void;
  children: ReactNode;
};

// The targets list only changes when a workspace is added, removed, renamed or
// recolored, so it is memoized on a key instead of on the workspaces array
// (which changes on every cwd update and would re-render every tab).
export function WorkspaceMoveProvider({ workspaces, onMoveTab, children }: Props) {
  const key = workspaces
    .filter((w) => !w.hibernated)
    .map((w) => `${w.id}\u0000${w.title}\u0000${resolveWorkspaceColor(w.color, w.id) ?? ""}`)
    .join("\u0001");
  // biome-ignore lint/correctness/useExhaustiveDependencies: key captures every field read from workspaces
  const targets = useMemo(
    () =>
      workspaces
        .filter((w) => !w.hibernated)
        .map((w) => ({
          id: w.id,
          title: w.title || "shell",
          color: resolveWorkspaceColor(w.color, w.id),
        })),
    [key],
  );
  const value = useMemo(() => ({ targets, moveTab: onMoveTab }), [targets, onMoveTab]);
  return <WorkspaceMoveContext.Provider value={value}>{children}</WorkspaceMoveContext.Provider>;
}
