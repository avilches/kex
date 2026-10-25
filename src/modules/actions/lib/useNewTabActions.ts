import { useMemo } from "react";
import { IS_WINDOWS } from "@/lib/platform";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useWorkspaceEnvStore } from "@/modules/workspace";
import { useDirGit } from "@/modules/workspaces/lib/dirGitStore";
import { scriptShellFor } from "@/modules/workspaces/lib/scriptCwd";
import { useSystemInfo } from "@/modules/workspaces/lib/systemInfoStore";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { buildCommandVars } from "./commandVars";
import { newTabActionEntries, type ContextActionGroups } from "./contextActionEntries";
import type { RunOverlay } from "./useActionRunner";
import type { Action } from "./types";
import { useActionStates } from "./useActionStates";
import { rowTabAt } from "./rowTab";

const NONE: readonly Action[] = [];
const EMPTY: ContextActionGroups = { workspace: [], global: [] };

type MenuWorkspace = Pick<Workspace, "actions" | "cwd" | "workspaceRoot" | "hibernated"> | null;

// The Actions a pane's new-tab menu offers, seen from the folder the pane works in (the
// workspace folder when it has none yet), and the values to run them with.
export function useNewTabActions(ws: MenuWorkspace, paneFolder: string | null): { groups: ContextActionGroups; overlay: RunOverlay | null } {
  const sys = useSystemInfo();
  const envKind = useWorkspaceEnvStore((s) => s.env.kind);
  const global = usePreferencesStore((s) => s.actions) ?? NONE;
  const states = useActionStates();
  const folder = paneFolder || ws?.workspaceRoot || ws?.cwd || "";
  const info = useDirGit(folder || undefined, folder ? `newtab:${folder}` : undefined);
  const vars = useMemo(
    () =>
      ws && folder
        ? buildCommandVars(rowTabAt(folder), { cwd: ws.cwd, workspaceRoot: ws.workspaceRoot }, { branch: info.branch, repoRoot: info.repoRoot }, sys.host)
        : null,
    [ws, folder, info.branch, info.repoRoot, sys.host],
  );
  const shell = scriptShellFor(IS_WINDOWS, envKind);
  const groups = useMemo(
    () =>
      vars
        ? newTabActionEntries(ws?.actions ?? NONE, global, {
            vars,
            shell,
            hibernated: !!ws?.hibernated,
            folders: { focusFolder: folder, workspaceRoot: ws?.workspaceRoot ?? null, workspaceCwd: ws?.cwd ?? null },
          }, states)
        : EMPTY,
    [vars, global, shell, states, folder, ws?.actions, ws?.hibernated, ws?.workspaceRoot, ws?.cwd],
  );
  const overlay = useMemo<RunOverlay | null>(
    () => (vars ? { vars, focusFolder: vars.cwd || undefined, spawnCwd: vars.cwd || undefined } : null),
    [vars],
  );
  return { groups, overlay };
}
