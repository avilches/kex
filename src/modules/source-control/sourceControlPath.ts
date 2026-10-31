export type SourceControlPathInput = {
  workspaceRoot: string | null;
  workspaceIsGitRepo: boolean;
  explorerRoot: string | null;
  fallback: string | null;
};

// A workspace whose root lives in a git repo always pins Source Control to it, so
// browsing elsewhere in the explorer (filesystem mode) does not change the repo.
export function resolveSourceControlPath(i: SourceControlPathInput): string | null {
  if (i.workspaceRoot && i.workspaceIsGitRepo) return i.workspaceRoot;
  return i.explorerRoot ?? i.fallback;
}
