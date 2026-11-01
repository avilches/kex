import { useCallback } from "react";
import { native } from "@/lib/native";
import type { SidebarView } from "@/modules/workspaces/lib/sidebarState";
import { explorerGitPath } from "./explorerGitPath";
import { resolveSourceControlPath } from "./sourceControlPath";
import { useSourceControl } from "./useSourceControl";

type Params = {
  explorerRoot: string | null;
  workspaceRoot: string | null;
  workspaceIsGitRepo: boolean;
  launchCwd: string | null;
  launchCwdResolved: boolean;
  home: string | null;
  cycleSidebarView: (view: SidebarView) => void;
  openCommitHistoryTab: (args: {
    repoRoot: string;
    branch: string | null;
  }) => void;
};

/**
 * Resolves the source-control repo (workspace root first, then explorer root) and feeds the
 * source-control summary. Resolution is unconditional so the rail badge and the
 * explorer git status stay populated regardless of the active right-panel tab.
 */
export function useSourceControlContext({
  explorerRoot,
  workspaceRoot,
  workspaceIsGitRepo,
  launchCwd,
  launchCwdResolved,
  home,
  cycleSidebarView,
  openCommitHistoryTab,
}: Params) {
  const workspaceFallbackPath = launchCwdResolved
    ? (launchCwd ?? home ?? null)
    : null;
  const sourceControlContextPath = resolveSourceControlPath({
    workspaceRoot,
    workspaceIsGitRepo,
    explorerRoot,
    fallback: workspaceFallbackPath,
  });
  const sourceControlPath = sourceControlContextPath;
  const sourceControl = useSourceControl(sourceControlPath ?? null, true);
  // The explorer decorates and writes .gitignore for the folder it shows. That is the Source Control
  // repo except when the workspace root is a repo and the explorer sits in another (a worktree, a
  // nested repo, a folder outside): then it reads its own status, and only then.
  const ownExplorerPath = explorerGitPath({ workspaceRoot, workspaceIsGitRepo, explorerRoot, sourceControlPath: sourceControlPath ?? null });
  const explorerOwn = useSourceControl(ownExplorerPath, ownExplorerPath !== null);
  const explorerGit = ownExplorerPath !== null ? explorerOwn : sourceControl;

  const toggleSourceControl = useCallback(() => {
    cycleSidebarView("git");
  }, [cycleSidebarView]);

  const openGitGraphFromContext = useCallback(async () => {
    const known = sourceControl.hasRepo ? sourceControl.repo : null;
    if (known) {
      openCommitHistoryTab({
        repoRoot: known.repoRoot,
        branch: sourceControl.status?.branch ?? null,
      });
      return;
    }
    if (!sourceControlContextPath) return;
    try {
      const repo = await native.gitResolveRepo(sourceControlContextPath);
      if (!repo) return;
      openCommitHistoryTab({ repoRoot: repo.repoRoot, branch: repo.branch });
    } catch {
      /* noop */
    }
  }, [
    openCommitHistoryTab,
    sourceControl.hasRepo,
    sourceControl.repo,
    sourceControl.status?.branch,
    sourceControlContextPath,
  ]);

  return { sourceControl, explorerGit, toggleSourceControl, openGitGraphFromContext };
}
