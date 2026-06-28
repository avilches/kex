import type { ExplorerRootMode } from "@/modules/workspaces/lib/explorerRoot";

// Common to every panel. `locked` (prevent close) applies to all kinds with no
// exception. `autofocus` lives here too so any new path-bearing kind opts in
// automatically; it is only *effective* where isAutofocusPanel is true.
type PanelCommon = {
  id: string;
  title?: string;
  locked?: boolean;
  autofocus?: boolean;
};

// Persisted visibility of a terminal's scratchpad bar, restored on startup.
export type ScratchpadState = "hidden" | "visible" | "focused";

export function scratchpadStateOf(open: boolean, active: boolean): ScratchpadState {
  if (!open) return "hidden";
  return active ? "focused" : "visible";
}

export type Panel =
  | (PanelCommon & { kind: "terminal"; cwd?: string; blocks?: boolean; restoreOnRestart?: boolean; persistentCommand?: string; scratchpad?: ScratchpadState })
  | (PanelCommon & { kind: "editor"; path: string; dirty: boolean; preview: boolean; previewMode?: "overlay" | "split"; overrideLanguage?: string | null })
  | (PanelCommon & { kind: "browser"; url: string; floating?: boolean })
  | (PanelCommon & { kind: "markdown"; path: string })
  | (PanelCommon & { kind: "git-diff"; path: string; repoRoot: string; mode: "-" | "+"; originalPath: string | null })
  | (PanelCommon & { kind: "git-history"; repoRoot: string })
  | (PanelCommon & { kind: "git-commit-file"; repoRoot: string; sha: string; path: string; originalPath: string | null });

// A panel can drive the sidebar (autofocus) when it resolves to a filesystem
// location: the terminal cwd, or any kind that carries a `path` (with a file or
// not). New path-bearing kinds get autofocus automatically, no list to update.
// Only browser (web URL) and git-history (no single file) lack it.
export function isAutofocusPanel(p: Panel): boolean {
  return p.kind === "terminal" || "path" in p;
}

export type PaneNode = {
  kind: "pane";
  id: string;
  panels: Panel[];
  activePanelId: string | null;
};

export type SplitNode =
  | PaneNode
  | {
      kind: "split";
      id: string;
      orientation: "horizontal" | "vertical";
      first: SplitNode;
      second: SplitNode;
      dividerPosition: number;
    };

export type WorkspaceGitConfig = {
  commitMessage: string;
  pushOnCommit: boolean;
};

export type Workspace = {
  id: string;
  title: string;
  cwd?: string;
  paneTree: SplitNode;
  activePaneId: string;
  explorerRootMode?: ExplorerRootMode;
  showHidden?: boolean;
  pinnedRoot?: string;
  fsRoot?: string;
  git?: WorkspaceGitConfig;
};

export type ClosedEntry = {
  panel: Panel;
  paneId: string;
  workspaceId: string;
};
