import { tabFilePath } from "@/modules/workspaces/lib/tabPath";
import type { Tab, Workspace } from "@/modules/workspaces/lib/types";
import type { COMMAND_VARIABLES } from "./actionForm";
import type { FocusPlace } from "./actionsBar";

// An agent that moved into a worktree works there while its terminal tab keeps the folder
// it was opened in, so the tab stands in the worktree for everything an Action reads.
export function inWorktree(tab: Tab | null, worktree: string | null | undefined): Tab | null {
  return tab && tab.kind === "terminal" && worktree ? { ...tab, cwd: worktree } : tab;
}

// The one place the values a command can read are put together: {target}, which the Header
// takes as the workspace root and a menu overrides with its own folder or file. The bar decides
// whether an Action is available from it and the runner expands the command from it, so the two
// can never disagree about what has a value.
export function buildCommandVars(ws: Pick<Workspace, "workspaceRoot">): Record<(typeof COMMAND_VARIABLES)[number], string> {
  return { target: (ws.workspaceRoot ?? "").trim() };
}

// What the focused tab offers Actions: a folder only on a terminal, a file when it has a path.
export function focusPlace(focused: Tab | null): FocusPlace {
  return { folder: focused?.kind === "terminal", file: !!(focused && tabFilePath(focused)) };
}
