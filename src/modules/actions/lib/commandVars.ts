import { tabRawValues } from "@/modules/workspaces/lib/titleVars";
import type { Tab, Workspace } from "@/modules/workspaces/lib/types";
import type { COMMAND_VARIABLES } from "./actionForm";

export type GitInfo = { branch: string; repoRoot: string };

type Place = Pick<Workspace, "cwd" | "workspaceRoot">;

// The one place the values a command can read are put together. The Header bar decides
// whether an Action is available from it and the runner expands the command from it, so
// the two can never disagree about what has a value.
export function buildCommandVars(
  focused: Tab | null,
  ws: Place,
  git: GitInfo,
  host: string,
): Record<(typeof COMMAND_VARIABLES)[number], string> {
  const raw = tabRawValues(focused, {
    fallbackDir: ws.cwd || ws.workspaceRoot || undefined,
    workspaceRoot: ws.workspaceRoot,
  });
  return {
    cwd: raw.cwd,
    dir: raw.dir,
    filename: raw.file,
    filepath: raw.path,
    workspace: raw.workspace,
    branch: git.branch,
    repo: git.repoRoot.split(/[\\/]/).filter(Boolean).pop() ?? "",
    host,
  };
}
