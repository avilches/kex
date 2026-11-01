import { useCallback } from "react";
import { IS_WINDOWS } from "@/lib/platform";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useWorkspaceEnvStore } from "@/modules/workspace";
import { scriptShellFor } from "@/modules/workspaces/lib/scriptCwd";
import type { Workspace } from "@/modules/workspaces/lib/types";
import type { CommandShell } from "./commandTemplate";
import { newTabActionEntries, type ContextActionGroups } from "./contextActionEntries";
import type { Action } from "./types";
import type { RunOverlay } from "./useActionRunner";

const NONE: readonly Action[] = [];
const EMPTY: ContextActionGroups = { workspace: [], global: [] };

type MenuWorkspace = Pick<Workspace, "id" | "actions" | "cwd" | "workspaceRoot">;

export type NewTabActions = { groups: ContextActionGroups; overlay: RunOverlay | null };

type Inputs = {
  ws: MenuWorkspace;
  folder: string;
  shell: CommandShell;
  global: readonly Action[];
};

// The Actions a new-tab surface offers for a folder, seen from the terminal that would open
// there, and the values to run them with, aimed at the workspace the folder belongs to.
function newTabActionsFor({ ws, folder, shell, global }: Inputs): NewTabActions {
  if (!folder) return { groups: EMPTY, overlay: null };
  const vars = { target: folder };
  const groups = newTabActionEntries(
    ws.actions ?? NONE,
    global,
    {
      vars,
      shell,
      focus: { folder, file: "" },
      folders: { workspaceRoot: ws.workspaceRoot ?? null, workspaceCwd: ws.cwd ?? null },
    },
  );
  return { groups, overlay: { vars, spawnCwd: folder, workspaceId: ws.id } };
}

// For the rows of the new terminal palette: a function, since the folder is only known once a
// row is picked.
export function useFolderRowActions(): (ws: MenuWorkspace | undefined, folder: string) => NewTabActions {
  const envKind = useWorkspaceEnvStore((s) => s.env.kind);
  const global = usePreferencesStore((s) => s.actions) ?? NONE;
  return useCallback(
    (ws, folder) => {
      if (!ws) return { groups: EMPTY, overlay: null };
      return newTabActionsFor({ ws, folder, shell: scriptShellFor(IS_WINDOWS, envKind), global });
    },
    [envKind, global],
  );
}
