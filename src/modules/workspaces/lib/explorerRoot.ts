import { pathDirname } from "@/lib/pathUtils";

export type ExplorerRootMode = "filesystem" | "pinned";

export type ResolveExplorerRootInput = {
  mode: ExplorerRootMode;
  pinnedRoot: string | null;
  fsRoot: string | null;
  home: string | null;
};

export function resolveExplorerRoot(r: ResolveExplorerRootInput): string | null {
  switch (r.mode) {
    case "pinned":
      return r.pinnedRoot;
    case "filesystem":
    default:
      return r.fsRoot ?? r.home;
  }
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
  gitRoot: string | null;
  currentFsRoot: string | null;
  home: string | null;
}): { mode: ExplorerRootMode; fsRoot: string | null } {
  const folder = normalizeSep(input.folder);
  const pinned = input.workspaceRoot ? normalizeSep(input.workspaceRoot) : null;
  const gitRoot = input.gitRoot ? normalizeSep(input.gitRoot) : null;
  // A git repo nested strictly inside the pinned root re-roots the explorer to it
  // so the explorer, source control and history all reflect the nested repo.
  if (
    pinned &&
    gitRoot &&
    gitRoot !== pinned &&
    isUnder(gitRoot, pinned) &&
    isUnder(folder, gitRoot)
  ) {
    return { mode: "filesystem", fsRoot: gitRoot };
  }
  if (pinned && isUnder(folder, pinned)) {
    return { mode: "pinned", fsRoot: null };
  }
  if (gitRoot && isUnder(folder, gitRoot)) {
    return { mode: "filesystem", fsRoot: gitRoot };
  }
  const fsRef = input.currentFsRoot ?? input.home;
  const ca = fsRef ? commonAncestor(fsRef, folder) : null;
  return { mode: "filesystem", fsRoot: ca ?? pathDirname(folder) };
}

export function migrateExplorerRootMode(
  mode: string | undefined,
): ExplorerRootMode | undefined {
  if (mode === "terminal" || mode === "git") return "filesystem";
  if (mode === "filesystem" || mode === "pinned") return mode;
  return undefined;
}
