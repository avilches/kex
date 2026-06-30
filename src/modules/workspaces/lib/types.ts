import type { ExplorerRootMode } from "@/modules/workspaces/lib/explorerRoot";
export type { ExplorerRootMode };

export type RunConfig = {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  panelId?: string;
};

// Common to every tab. `locked` (prevent close) applies to all kinds with no
// exception. `autofocus` lives here too so any new path-bearing kind opts in
// automatically; it is only *effective* where isAutofocusTab is true.
type TabCommon = {
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

export type Tab =
  | (TabCommon & { kind: "terminal"; cwd?: string; blocks?: boolean; restoreOnRestart?: boolean; persistentCommand?: string; scratchpad?: ScratchpadState })
  | (TabCommon & { kind: "editor"; path: string; dirty: boolean; preview: boolean; previewMode?: "overlay" | "split"; overrideLanguage?: string | null })
  | (TabCommon & { kind: "browser"; url: string; floating?: boolean })
  | (TabCommon & { kind: "markdown"; path: string })
  | (TabCommon & { kind: "git-diff"; path: string; repoRoot: string; mode: "-" | "+"; originalPath: string | null })
  | (TabCommon & { kind: "git-history"; repoRoot: string })
  | (TabCommon & { kind: "git-commit-file"; repoRoot: string; sha: string; path: string; originalPath: string | null });

// A tab can drive the sidebar (autofocus) when it resolves to a filesystem
// location: the terminal cwd, or any kind that carries a `path` (with a file or
// not). New path-bearing kinds get autofocus automatically, no list to update.
// Only browser (web URL) and git-history (no single file) lack it.
export function isAutofocusTab(p: Tab): boolean {
  return p.kind === "terminal" || "path" in p;
}

export type PaneNode = {
  kind: "pane";
  id: string;
  tabs: Tab[];
  activeTabId: string | null;
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
  color?: string | null;
  icon?: string;
  statusId?: string;
  scripts?: RunConfig[];
  activeScript?: string;
  scriptPaneId?: string;
};

export type ClosedEntry = {
  tab: Tab;
  paneId: string;
  workspaceId: string;
};
