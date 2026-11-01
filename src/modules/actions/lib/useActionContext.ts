import { useMemo } from "react";
import { IS_WINDOWS } from "@/lib/platform";
import { useWorkspaceEnvStore } from "@/modules/workspace";
import { tabWorktree } from "@/modules/workspaces/lib/hibernate";
import { scriptShellFor } from "@/modules/workspaces/lib/scriptCwd";
import { focusedTab } from "@/modules/workspaces/lib/splitNode";
import { tabFilePath, tabFolder } from "@/modules/workspaces/lib/tabPath";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { buildCommandVars, focusPlace, inWorktree } from "./commandVars";
import type { Workspace } from "@/modules/workspaces/lib/types";
import type { CommandShell } from "./commandTemplate";
import type { BarContext, FocusPlace } from "./actionsBar";

export type ActionContext = {
  vars: Record<string, string>;
  shell: CommandShell;
  place: FocusPlace;
  focus: NonNullable<BarContext["focus"]>;
  folders: NonNullable<BarContext["folders"]>;
};

// The values an Action would see if it ran right now from this workspace, the same ones the
// runner builds. Settings has no workspace, so its editor passes none and gets no values.
export function useActionContext(
  ws: Pick<Workspace, "paneTree" | "activePaneId" | "cwd" | "workspaceRoot"> | null,
): ActionContext | null {
  const envKind = useWorkspaceEnvStore((s) => s.env.kind);
  const tab = ws ? focusedTab(ws.paneTree, ws.activePaneId) : null;
  const liveWorktree = useAgentStore((s) => (tab ? (s.sessions[tab.id]?.meta?.worktreeCwd ?? null) : null));
  const worktree = tabWorktree(tab, liveWorktree);
  const focused = useMemo(() => inWorktree(tab, worktree), [tab, worktree]);
  const vars = ws ? buildCommandVars(ws) : null;
  const focus = { folder: focused?.kind === "terminal" ? (tabFolder(focused) ?? "") : "", file: (focused && tabFilePath(focused)) || "" };
  const folders = {
    workspaceRoot: ws?.workspaceRoot ?? null,
    workspaceCwd: ws?.cwd ?? null,
  };
  const key = vars ? JSON.stringify([vars, envKind, focused?.kind, focus, folders]) : null;
  return useMemo(
    () =>
      vars
        ? {
            vars,
            shell: scriptShellFor(IS_WINDOWS, envKind),
            place: focusPlace(focused),
            focus,
            folders,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
}
