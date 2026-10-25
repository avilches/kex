import { tabFilePath } from "@/modules/workspaces/lib/tabPath";
import { tabRawValues } from "@/modules/workspaces/lib/titleVars";
import type { Tab, Workspace } from "@/modules/workspaces/lib/types";
import type { COMMAND_VARIABLES } from "./actionForm";
import type { FocusPlace } from "./actionsBar";

export type GitInfo = { branch: string; repoRoot: string };

type Place = Pick<Workspace, "cwd" | "workspaceRoot">;

// An agent that moved into a worktree works there while its terminal tab keeps the folder
// it was opened in, so the tab stands in the worktree for everything an Action reads.
export function inWorktree(tab: Tab | null, worktree: string | null | undefined): Tab | null {
  return tab && tab.kind === "terminal" && worktree ? { ...tab, cwd: worktree } : tab;
}

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
    workspace: raw.workspace.trim(),
    branch: git.branch,
    repo: git.repoRoot.split(/[\\/]/).filter(Boolean).pop() ?? "",
    host,
  };
}

// What the focused tab offers Actions: a folder only on a terminal, a file when it has a path.
export function focusPlace(focused: Tab | null): FocusPlace {
  return { folder: focused?.kind === "terminal", file: !!(focused && tabFilePath(focused)) };
}
