export type ExplorerGitPathInput = {
  workspaceRoot: string | null;
  workspaceIsGitRepo: boolean;
  explorerRoot: string | null;
  /** The folder Source Control is resolved from (`resolveSourceControlPath`). */
  sourceControlPath: string | null;
};

// Source Control stays anchored to the repo of the workspace root, but the explorer decorates and writes
// `.gitignore` for the folder it shows. The two only differ when the workspace root is a repo and the
// explorer is somewhere else: then the explorer needs its own status, resolved from its root. In every
// other case both read the same path, and the Source Control state is reused at no cost.
export function explorerGitPath(i: ExplorerGitPathInput): string | null {
  if (!i.explorerRoot) return null;
  if (!(i.workspaceRoot && i.workspaceIsGitRepo)) return null;
  if (i.explorerRoot === i.sourceControlPath) return null;
  return i.explorerRoot;
}
