import type { GitChangedFile, GitStatusSnapshot } from "@/lib/native";

export type GitStatusCode = "M" | "A" | "D" | "U" | "R";

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

// Single normalization shared by every raw-git-status-to-badge mapping in the
// app (source-control's staged/unstaged entries, git-history's per-commit
// file list): collapses the raw single-letter codes git emits (which include
// "?" for untracked and "C" for copied, with no dedicated category of its
// own) down to the canonical GitStatusCode set.
export function normalizeGitStatusCode(status: string): GitStatusCode {
  switch (status.trim().toUpperCase()) {
    case "?":
    case "U":
      return "U";
    case "A":
      return "A";
    case "D":
      return "D";
    case "R":
    case "C":
      return "R";
    default:
      return "M";
  }
}

export type GitStatusCategory = "added" | "modified" | "deleted" | "renamed" | "untracked";

// Single classification shared by every status-to-color/class mapping in the app
// (gitStatusHexColor, statusTextClass, statusTone): renamed and copied share a
// category, as do untracked and the raw "?" git emits for it. Returns null for
// any code outside this set so each presentational mapping keeps its own
// fallback instead of silently defaulting to "modified".
export function gitStatusCategory(code: string): GitStatusCategory | null {
  switch (code.trim().toUpperCase()) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
    case "C":
      return "renamed";
    case "U":
    case "?":
      return "untracked";
    default:
      return null;
  }
}

export function statusCodeForFile(file: GitChangedFile): GitStatusCode {
  if (file.untracked) return "U";
  if (file.indexStatus === "U" || file.worktreeStatus === "U") return "U";
  const primary = file.unstaged ? file.worktreeStatus : file.indexStatus;
  const fallback = file.unstaged ? file.indexStatus : file.worktreeStatus;
  return normalizeGitStatusCode(primary !== " " ? primary : fallback);
}

export function buildGitStatusMap(
  status: GitStatusSnapshot,
): Map<string, GitStatusCode> {
  const map = new Map<string, GitStatusCode>();
  for (const file of status.changedFiles) {
    map.set(normalizePath(file.path), statusCodeForFile(file));
  }
  return map;
}

const DIR_PRIORITY: Record<GitStatusCode, number> = {
  M: 5,
  U: 4,
  A: 3,
  R: 2,
  D: 1,
};

// Propagate each changed file's status up to its ancestor directories so a
// collapsed folder still signals where changes live. One pass over the map,
// O(files x depth); call once per snapshot.
export function bubbleUpDirectoryStatuses(
  map: Map<string, GitStatusCode>,
): void {
  for (const [path, code] of [...map.entries()]) {
    const segs = path.split("/");
    segs.pop();
    let prefix = "";
    for (const seg of segs) {
      prefix = prefix ? `${prefix}/${seg}` : seg;
      const existing = map.get(prefix);
      if (!existing || DIR_PRIORITY[code] > DIR_PRIORITY[existing]) {
        map.set(prefix, code);
      }
    }
  }
}

function uniqueRoots(roots: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const root of roots) {
    if (!root) continue;
    const norm = normalizePath(root);
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

export function repoRelativePath(
  absolutePath: string,
  roots: string[],
): string | null {
  const abs = normalizePath(absolutePath);
  for (const repo of uniqueRoots(roots)) {
    if (abs === repo) return "";
    if (abs.startsWith(`${repo}/`)) return abs.slice(repo.length + 1);
  }
  return null;
}

export function lookupGitStatus(
  map: Map<string, GitStatusCode>,
  repoRoot: string,
  absolutePath: string,
  alternateRoots: string[] = [],
): GitStatusCode | null {
  const rel = repoRelativePath(absolutePath, [repoRoot, ...alternateRoots]);
  if (rel === null) return null;
  return map.get(rel) ?? null;
}
