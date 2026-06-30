import type { Tab } from "./types";

const ABSOLUTE = /^([A-Za-z]:|\/|\\)/;

function join(repoRoot: string, path: string): string {
  return `${repoRoot.replace(/[\\/]+$/, "")}/${path.replace(/^[\\/]+/, "")}`.replace(
    /\\/g,
    "/",
  );
}

export function tabFilePath(tab: Tab): string | null {
  switch (tab.kind) {
    // Repo-relative paths need joining with their repoRoot.
    case "git-diff":
      return ABSOLUTE.test(tab.path)
        ? tab.path.replace(/\\/g, "/")
        : join(tab.repoRoot, tab.path);
    case "git-commit-file":
      return join(tab.repoRoot, tab.path);
    // Any other kind carrying an absolute `path` (editor, markdown, future
    // editors) resolves generically, so new kinds need no change here.
    default:
      return "path" in tab ? tab.path.replace(/\\/g, "/") : null;
  }
}
