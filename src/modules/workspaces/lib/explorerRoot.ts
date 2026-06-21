import { pathDirname } from "@/lib/pathUtils";

export type ExplorerRootMode = "terminal" | "git" | "filesystem" | "pinned";

export type ResolveExplorerRootInput = {
  mode: ExplorerRootMode;
  terminalCwd: string | null;
  gitRoot: string | null;
  pinnedRoot: string | null;
  fsRoot: string | null;
  home: string | null;
};

export function resolveExplorerRoot(r: ResolveExplorerRootInput): string | null {
  switch (r.mode) {
    case "filesystem":
      return r.fsRoot ?? r.home;
    case "pinned":
      return r.pinnedRoot;
    case "git":
      return r.gitRoot ?? r.terminalCwd ?? r.home;
    case "terminal":
    default:
      return r.terminalCwd ?? r.home;
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
