import type { Panel } from "./types";

const ABSOLUTE = /^([A-Za-z]:|\/|\\)/;

function join(repoRoot: string, path: string): string {
  return `${repoRoot.replace(/[\\/]+$/, "")}/${path.replace(/^[\\/]+/, "")}`.replace(
    /\\/g,
    "/",
  );
}

export function panelFilePath(panel: Panel): string | null {
  switch (panel.kind) {
    case "editor":
    case "markdown":
      return panel.path.replace(/\\/g, "/");
    case "git-diff":
      return ABSOLUTE.test(panel.path)
        ? panel.path.replace(/\\/g, "/")
        : join(panel.repoRoot, panel.path);
    case "git-commit-file":
      return join(panel.repoRoot, panel.path);
    default:
      return null;
  }
}
