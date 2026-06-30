import { useCallback } from "react";
import { native } from "@/lib/native";
import type { SidebarView } from "@/modules/workspaces/lib/sidebarState";
import { useSourceControl } from "./useSourceControl";

type Params = {
  explorerRoot: string | null;
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
 * Resolves the source-control repo from the explorer root and feeds the
 * source-control summary. Resolution is unconditional so the rail badge and the
 * explorer git status stay populated regardless of the active right-panel tab.
 */
export function useSourceControlContext({
  explorerRoot,
  launchCwd,
  launchCwdResolved,
  home,
  cycleSidebarView,
  openCommitHistoryTab,
}: Params) {
  const workspaceFallbackPath = launchCwdResolved
    ? (launchCwd ?? home ?? null)
    : null;
  // explorerRootMode is always workspace|filesystem; the displayed folder is the
  // git context so SC and explorer decorations reflect the explorer root's repo.
  const sourceControlContextPath = explorerRoot ?? workspaceFallbackPath;
  const sourceControlPath = sourceControlContextPath;
  const sourceControl = useSourceControl(sourceControlPath ?? null, true);

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

  return { sourceControl, toggleSourceControl, openGitGraphFromContext };
}
