import { pathDirname } from "@/lib/pathUtils";

export type ExplorerRootMode = "workspace" | "filesystem";

export type ResolveExplorerRootInput = {
  mode: ExplorerRootMode;
  workspaceRoot: string | null;
  fsRoot: string | null;
  home: string | null;
};

export function resolveExplorerRoot(r: ResolveExplorerRootInput): string | null {
  switch (r.mode) {
    case "workspace":
      return r.workspaceRoot;
    case "filesystem":
    default:
      return r.fsRoot ?? r.home;
  }
}

// git reports the repo root already canonicalized (symlinks resolved). Map it back
// onto the path the user is actually in, so the explorer does not jump to the
// physical location: drop from `folder` the same trailing segments that separate
// the canonical folder from the canonical repo root.
export function logicalRepoRoot(
  folder: string,
  canonicalFolder: string,
  repoRoot: string,
): string {
  const f = normalizeSep(folder).replace(/\/+$/, "");
  const cf = normalizeSep(canonicalFolder).replace(/\/+$/, "");
  const rr = normalizeSep(repoRoot).replace(/\/+$/, "");
  if (!isUnder(cf, rr)) return repoRoot;
  const suffix = cf.slice(rr.length);
  if (suffix === "") return f || "/";
  if (!f.endsWith(suffix)) return repoRoot;
  return f.slice(0, f.length - suffix.length) || "/";
}

export async function nearestExistingDir(
  path: string,
  exists: (p: string) => Promise<boolean>,
): Promise<string> {
  let current = path;
  while (!isFilesystemRoot(current)) {
    if (await exists(current)) return current;
    const parent = parentRoot(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

const DRIVE_ROOT = /^[A-Za-z]:\/?$/;
const BARE_DRIVE = /^[A-Za-z]:$/;

export function isFilesystemRoot(path: string): boolean {
  return path === "/" || DRIVE_ROOT.test(path);
}

export function parentRoot(path: string): string {
  const parent = pathDirname(path);
  return BARE_DRIVE.test(parent) ? `${parent}/` : parent;
}

function normalizeSep(path: string): string {
  return path.replace(/\\/g, "/");
}

export function isUnder(path: string, root: string): boolean {
  const p = normalizeSep(path);
  const r = normalizeSep(root);
  return p === r || p.startsWith(r.endsWith("/") ? r : `${r}/`);
}

export function commonAncestor(a: string, b: string): string | null {
  const sa = normalizeSep(a).split("/");
  const sb = normalizeSep(b).split("/");
  const common: string[] = [];
  for (let i = 0; i < sa.length && i < sb.length; i++) {
    if (sa[i] !== sb[i]) break;
    common.push(sa[i]);
  }
  if (common.length === 0) return null;
  if (common.length === 1) {
    if (common[0] === "") return "/";
    if (BARE_DRIVE.test(common[0])) return `${common[0]}/`;
    return null;
  }
  return common.join("/");
}

export function ancestorsToExpand(root: string, file: string): string[] {
  const r = normalizeSep(root);
  let dir = pathDirname(normalizeSep(file));
  if (!isUnder(dir, r)) return [];
  const out: string[] = [];
  while (dir !== r && isUnder(dir, r)) {
    out.unshift(dir);
    const parent = pathDirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return out;
}

export function resolveSidebarTarget(input: {
  folder: string;
  workspaceRoot: string | null;
  workspaceGitRoot: string | null;
  gitRoot: string | null;
  currentFsRoot: string | null;
  home: string | null;
}): { mode: ExplorerRootMode; fsRoot: string | null } {
  const folder = normalizeSep(input.folder);
  const pinned = input.workspaceRoot ? normalizeSep(input.workspaceRoot) : null;
  const gitRoot = input.gitRoot ? normalizeSep(input.gitRoot) : null;
  const pinnedGitRoot = input.workspaceGitRoot
    ? normalizeSep(input.workspaceGitRoot)
    : null;
  // A git repo nested strictly inside the workspace root re-roots the explorer to
  // it (so explorer, source control and history all reflect the nested repo), but
  // only when the workspace root itself belongs to a repo. That anchors a worktree
  // under a project repo to the worktree, while a non-repo container workspace
  // stays put: focusing a file in one of its projects never drops the wider view.
  if (
    pinned &&
    pinnedGitRoot &&
    gitRoot &&
    gitRoot !== pinnedGitRoot &&
    isUnder(gitRoot, pinned) &&
    isUnder(folder, gitRoot)
  ) {
    return { mode: "filesystem", fsRoot: gitRoot };
  }
  if (pinned && isUnder(folder, pinned)) {
    return { mode: "workspace", fsRoot: null };
  }
  if (gitRoot && isUnder(folder, gitRoot)) {
    return { mode: "filesystem", fsRoot: gitRoot };
  }
  const fsRef = input.currentFsRoot ?? input.home;
  const ca = fsRef ? commonAncestor(fsRef, folder) : null;
  return { mode: "filesystem", fsRoot: ca ?? pathDirname(folder) };
}
