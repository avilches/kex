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
    // Repo-relative paths need joining with their repoRoot.
    case "git-diff":
      return ABSOLUTE.test(panel.path)
        ? panel.path.replace(/\\/g, "/")
        : join(panel.repoRoot, panel.path);
    case "git-commit-file":
      return join(panel.repoRoot, panel.path);
    // Any other kind carrying an absolute `path` (editor, markdown, future
    // editors) resolves generically, so new kinds need no change here.
    default:
      return "path" in panel ? panel.path.replace(/\\/g, "/") : null;
  }
}
