import { pathDirname } from "@/lib/pathUtils";

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}

function isUnder(path: string, root: string): boolean {
  const p = normalize(path);
  const r = normalize(root);
  if (p === r) return true;
  return p.startsWith(r.endsWith("/") ? r : `${r}/`);
}

// Root a recordar para un fichero abierto mientras se mostraba `explorerRoot`:
// el propio explorerRoot si el fichero cuelga de el, o la carpeta del fichero.
export function resolveOpenRoot(
  explorerRoot: string | null,
  path: string,
): string {
  if (explorerRoot && isUnder(path, explorerRoot)) return explorerRoot;
  return pathDirname(path);
}

// Root expuesto para el panel activo: si es de fichero usa su explorerRoot
// recordado, o en su defecto la carpeta del propio fichero; si no, el ambiental.
export function resolveActiveExplorerRoot(
  activePanel: { kind: string; explorerRoot?: string; path?: string } | null,
  ambient: string | null,
): string | null {
  if (
    activePanel &&
    (activePanel.kind === "editor" || activePanel.kind === "markdown")
  ) {
    if (activePanel.explorerRoot) return activePanel.explorerRoot;
    if (activePanel.path) return pathDirname(activePanel.path);
  }
  return ambient;
}

export type ExplorerRootMode = "terminal" | "git" | "filesystem" | "pinned";

export type ResolveExplorerRootInput = {
  mode: ExplorerRootMode;
  terminalCwd: string | null;
  gitRoot: string | null;
  pinnedRoot: string | null;
  home: string;
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
