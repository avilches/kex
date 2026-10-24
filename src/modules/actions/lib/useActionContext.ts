import { useMemo } from "react";
import { IS_WINDOWS } from "@/lib/platform";
import { useWorkspaceEnvStore } from "@/modules/workspace";
import { useDirGit } from "@/modules/workspaces/lib/dirGitStore";
import { scriptShellFor } from "@/modules/workspaces/lib/scriptCwd";
import { focusedTab } from "@/modules/workspaces/lib/splitNode";
import { tabFilePath } from "@/modules/workspaces/lib/tabPath";
import { useSystemInfo } from "@/modules/workspaces/lib/systemInfoStore";
import { workspaceDir } from "@/modules/workspaces/lib/titleVars";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { buildCommandVars, inWorktree } from "./commandVars";
import type { Workspace } from "@/modules/workspaces/lib/types";
import type { CommandShell } from "./commandTemplate";
import type { FocusPlace } from "./actionsBar";

export type ActionContext = { vars: Record<string, string>; shell: CommandShell; hibernated: boolean; place: FocusPlace };

// The values an Action would see if it ran right now from this workspace, the same ones the
// runner builds. Settings has no workspace, so its editor passes none and gets no values.
export function useActionContext(
  ws: Pick<Workspace, "paneTree" | "activePaneId" | "cwd" | "workspaceRoot" | "hibernated"> | null,
): ActionContext | null {
  const sys = useSystemInfo();
  const envKind = useWorkspaceEnvStore((s) => s.env.kind);
  const tab = ws ? focusedTab(ws.paneTree, ws.activePaneId) : null;
  const worktree = useAgentStore((s) => (tab ? (s.sessions[tab.id]?.meta?.worktreeCwd ?? null) : null));
  const focused = useMemo(() => inWorktree(tab, worktree), [tab, worktree]);
  const dir = ws ? workspaceDir(ws, focused) : undefined;
  // The focused tab owns the folder: a command that ends in it can have changed the branch.
  const info = useDirGit(dir, focused?.id);
  const vars = ws ? buildCommandVars(focused, ws, info, sys.host) : null;
  const hibernated = !!ws?.hibernated;
  const key = vars ? JSON.stringify([vars, envKind, hibernated, focused?.kind, focused && tabFilePath(focused)]) : null;
  return useMemo(
    () =>
      vars
        ? {
            vars,
            shell: scriptShellFor(IS_WINDOWS, envKind),
            hibernated,
            place: { folder: focused?.kind === "terminal", file: !!(focused && tabFilePath(focused)) },
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
}
