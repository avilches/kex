import { useMemo } from "react";
import { IS_WINDOWS } from "@/lib/platform";
import { useWorkspaceEnvStore } from "@/modules/workspace";
import { useDirGit } from "@/modules/workspaces/lib/dirGitStore";
import { scriptShellFor } from "@/modules/workspaces/lib/scriptCwd";
import { focusedTab } from "@/modules/workspaces/lib/splitNode";
import { useSystemInfo } from "@/modules/workspaces/lib/systemInfoStore";
import { tabRawValues } from "@/modules/workspaces/lib/titleVars";
import type { Workspace } from "@/modules/workspaces/lib/types";
import type { CommandShell } from "./commandTemplate";

export type ActionContext = { vars: Record<string, string>; shell: CommandShell };

// The values an Action would see if it ran right now from this workspace, the same ones the
// runner builds. Settings has no workspace, so its editor passes none and gets no values.
export function useActionContext(
  ws: Pick<Workspace, "paneTree" | "activePaneId" | "cwd" | "workspaceRoot"> | null,
  owner = "actions-editor",
): ActionContext | null {
  const sys = useSystemInfo();
  const envKind = useWorkspaceEnvStore((s) => s.env.kind);
  const focused = ws ? focusedTab(ws.paneTree, ws.activePaneId) : null;
  const raw = ws
    ? tabRawValues(focused, { fallbackDir: ws.cwd || ws.workspaceRoot || undefined, workspaceRoot: ws.workspaceRoot })
    : null;
  const git = useDirGit(raw?.cwd || undefined, ws ? owner : undefined);
  const repo = git.repoRoot.split(/[\\/]/).filter(Boolean).pop() ?? "";
  const key = raw ? JSON.stringify([raw, git.branch, repo, sys.host, envKind]) : null;
  return useMemo(
    () =>
      raw
        ? { vars: { ...raw, branch: git.branch, repo, host: sys.host }, shell: scriptShellFor(IS_WINDOWS, envKind) }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
}
