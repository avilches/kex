export type ExplorerRootMode = "terminal" | "git" | "filesystem" | "pinned";

export type ResolveExplorerRootInput = {
  mode: ExplorerRootMode;
  terminalCwd: string | null;
  gitRoot: string | null;
  pinnedRoot: string | null;
  home: string | null;
};

export function resolveExplorerRoot(r: ResolveExplorerRootInput): string | null {
  switch (r.mode) {
    case "filesystem":
      return r.home;
    case "pinned":
      return r.pinnedRoot;
    case "git":
      return r.gitRoot ?? r.terminalCwd ?? r.home;
    case "terminal":
    default:
      return r.terminalCwd ?? r.home;
  }
}
