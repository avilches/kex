import { useCallback } from "react";
import { IS_WINDOWS } from "@/lib/platform";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useWorkspaceEnvStore } from "@/modules/workspace";
import { getDirGit } from "@/modules/workspaces/lib/dirGitStore";
import { scriptShellFor } from "@/modules/workspaces/lib/scriptCwd";
import { useSystemInfo } from "@/modules/workspaces/lib/systemInfoStore";
import type { Workspace } from "@/modules/workspaces/lib/types";
import type { CommandShell } from "./commandTemplate";
import { buildCommandVars } from "./commandVars";
import { newTabActionEntries, type ContextActionGroups } from "./contextActionEntries";
import { rowTabAt } from "./rowTab";
import type { Action } from "./types";
import type { RunOverlay } from "./useActionRunner";

const NONE: readonly Action[] = [];
const EMPTY: ContextActionGroups = { workspace: [], global: [] };

type MenuWorkspace = Pick<Workspace, "id" | "actions" | "cwd" | "workspaceRoot">;

export type NewTabActions = { groups: ContextActionGroups; overlay: RunOverlay | null };

type Inputs = {
  ws: MenuWorkspace;
  folder: string;
  git: { branch: string; repoRoot: string };
  host: string;
  shell: CommandShell;
  global: readonly Action[];
};

// The Actions a new-tab surface offers for a folder, seen from the terminal that would open
// there, and the values to run them with, aimed at the workspace the folder belongs to.
function newTabActionsFor({ ws, folder, git, host, shell, global }: Inputs): NewTabActions {
  if (!folder) return { groups: EMPTY, overlay: null };
  const vars = { ...buildCommandVars(rowTabAt(folder), { cwd: ws.cwd, workspaceRoot: ws.workspaceRoot }, git, host), target: folder };
  const groups = newTabActionEntries(
    ws.actions ?? NONE,
    global,
    {
      vars,
      shell,
      folders: { focusFolder: folder, workspaceRoot: ws.workspaceRoot ?? null, workspaceCwd: ws.cwd ?? null },
    },
  );
  return { groups, overlay: { vars, focusFolder: folder, spawnCwd: folder, workspaceId: ws.id } };
}

// For the rows of the new terminal palette: a function, since the folder is only known once a
// row is picked. The branch the row already shows stands in until the git cache has answered.
export function useFolderRowActions(): (ws: MenuWorkspace | undefined, folder: string, branch: string | null) => NewTabActions {
  const sys = useSystemInfo();
  const envKind = useWorkspaceEnvStore((s) => s.env.kind);
  const global = usePreferencesStore((s) => s.actions) ?? NONE;
  return useCallback(
    (ws, folder, branch) => {
      if (!ws) return { groups: EMPTY, overlay: null };
      const git = getDirGit(folder);
      return newTabActionsFor({
        ws,
        folder,
        git: { branch: git.branch || branch || "", repoRoot: git.repoRoot },
        host: sys.host,
        shell: scriptShellFor(IS_WINDOWS, envKind),
        global,
      });
    },
    [sys.host, envKind, global],
  );
}
