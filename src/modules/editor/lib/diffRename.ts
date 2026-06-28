export function diffRenameLabel(
  path: string,
  originalPath: string | null,
): string | null {
  if (!originalPath || originalPath === path) return null;
  return originalPath.split(/[\\/]/).pop() ?? originalPath;
}

export function joinRepoPath(repoRoot: string, relPath: string): string {
  const parts = [
    ...repoRoot.split(/[\\/]/),
    ...relPath.split(/[\\/]/),
  ].filter(Boolean);
  const leadingSlash = /^[\\/]/.test(repoRoot) ? "/" : "";
  return leadingSlash + parts.join("/");
}
