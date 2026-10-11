import type { ExplorerRootMode } from "@/modules/workspaces/lib/explorerRoot";
export type { ExplorerRootMode };
import type { AutofocusMode } from "@/modules/settings/store";

export type ScriptCwdMode = "workspace" | "context" | "fixed";

export type Script = {
  id: string;
  name: string;
  command: string;
  cwdMode?: ScriptCwdMode;
  /** Only used when cwdMode is "fixed". */
  cwd?: string;
  tabId?: string;
};

// Common to every tab. `locked` (prevent close) applies to all kinds with no
// exception. `autofocus` lives here too so any new path-bearing kind opts in
// automatically; it is only *effective* where isAutofocusTab is true.
type TabCommon = {
  id: string;
  title?: string;
  // Markdown the user attaches to the tab, shown in a floating panel while `noteOpen`.
  note?: string;
  noteOpen?: boolean;
  // Relative to the pane's top-left; absent means docked under the tab.
  notePos?: { x: number; y: number };
  locked?: boolean;
  autofocus?: boolean;
};

export type Tab =
  | (TabCommon & { kind: "terminal"; cwd?: string; blocks?: boolean; restoreOnRestart?: boolean; persistentCommand?: string; scratchpadEnabled?: boolean })
  | (TabCommon & {
      kind: "editor";
      path: string;
      dirty: boolean;
      preview: boolean;
      previewMode?: "overlay" | "split";
      overrideLanguage?: string | null;
    })
  | (TabCommon & { kind: "browser"; url: string; floating?: boolean })
  | (TabCommon & { kind: "markdown"; path: string; dirty?: boolean })
  | (TabCommon & { kind: "git-diff"; path: string; repoRoot: string; mode: "-" | "+"; originalPath: string | null; preview: boolean })
  | (TabCommon & { kind: "git-history"; repoRoot: string })
  | (TabCommon & { kind: "git-commit-file"; repoRoot: string; sha: string; path: string; originalPath: string | null; preview: boolean });

// A tab can drive the sidebar (autofocus) when it resolves to a filesystem
// location: the terminal cwd, or any kind that carries a `path` (with a file or
// not). New path-bearing kinds get autofocus automatically, no list to update.
// Only browser (web URL) and git-history (no single file) lack it.
export function isAutofocusTab(p: Tab): boolean {
  return p.kind === "terminal" || "path" in p;
}

// In "always" mode every capable tab drives the sidebar; the per-tab flag is
// kept untouched so it applies again when the mode is switched back.
export function isAutofocusActive(p: Tab, mode: AutofocusMode): boolean {
  return isAutofocusTab(p) && (mode === "always" || p.autofocus === true);
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

export type WorkspaceGroup = { id: string; label: string };

export type Workspace = {
  id: string;
  title: string;
  cwd?: string;
  paneTree: SplitNode;
  activePaneId: string;
  explorerRootMode?: ExplorerRootMode;
  showHidden?: boolean;
  workspaceRoot?: string;
  fsRoot?: string;
  git?: WorkspaceGitConfig;
  color?: string | null;
  icon?: string;
  groupId?: string;
  scripts?: Script[];
  activeScript?: string;
  scriptPaneId?: string;
  // The nested tab list under this workspace in the WorkspaceBar is open.
  detailExpanded?: boolean;
  // The workspace keeps its pane tree and tabs in the JSON but mounts none of
  // them; waking it brings editors, commands and agents back.
  hibernated?: boolean;
  // Epoch ms when it was hibernated; absent in workspaces hibernated before it existed.
  hibernatedAt?: number;
};

export type ClosedEntry = {
  tab: Tab;
  paneId: string;
  workspaceId: string;
};
