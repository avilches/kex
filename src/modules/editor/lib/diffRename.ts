import { pathJoin } from "@/lib/pathUtils";

export function diffRenameLabel(
  path: string,
  originalPath: string | null,
): string | null {
  if (!originalPath || originalPath === path) return null;
  return originalPath.split(/[\\/]/).pop() ?? originalPath;
}

export const joinRepoPath = pathJoin;
