import type { ExplorerRootMode } from "@/modules/workspaces/lib/explorerRoot";
export type { ExplorerRootMode };
import type { Action } from "@/modules/actions";
import type { AutofocusMode } from "@/modules/settings/store";
import type { WorkspaceSidebar } from "./sidebarSnapshot";

export type ScriptCwdMode = "home" | "workspace" | "context" | "fixed";

// A terminal tab that is asleep: no PTY, no render slot, same id. Its presence is the flag.
// What the placeholder shows besides the title (the agent and the restore command) is gone with the
// PTY, so it is captured when the tab goes to sleep. `title` is the name the tab showed then, kept
// because the process that fed it is gone. `at` is the epoch ms it went to sleep.
export type TabHibernation = { at: number; agent?: string; command?: string; title?: string };

// Common to every tab. `locked` (prevent close) applies to all kinds with no
// exception.
type TabCommon = {
  id: string;
  title?: string;
  // Markdown the user attaches to the tab, shown in a floating panel while `noteOpen`.
  note?: string;
  noteOpen?: boolean;
  // Relative to the pane's top-left; absent means docked under the tab.
  notePos?: { x: number; y: number };
  // Set once the note is resized; absent means the default width and content-sized height.
  noteSize?: { width: number; height: number };
  locked?: boolean;
  // Name from WORKSPACE_ICON_PALETTE that replaces the default icon of the kind.
  icon?: string;
  // Hex color of the tab: tints its icon and side stripe, and its top line when the workspace has none.
  color?: string;
};

export type Tab =
  | (TabCommon & { kind: "terminal"; cwd?: string; blocks?: boolean; restoreOnRestart?: boolean; persistentCommand?: string; persistentCommandManual?: boolean; scratchpadEnabled?: boolean; hibernation?: TabHibernation; agentTitle?: string })
  | (TabCommon & {
      kind: "editor";
      path: string;
      dirty: boolean;
      preview: boolean;
      previewMode?: "overlay" | "split";
      overrideLanguage?: string | null;
    })
  | (TabCommon & { kind: "browser"; url: string; floating?: boolean })
  | (TabCommon & { kind: "markdown"; path: string; dirty?: boolean; preview?: boolean })
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

// In "always" mode every capable tab drives the sidebar, and in "noRoot" mode
// every capable tab of a workspace without a root does. In "manual" none does.
export function isAutofocusActive(
  p: Tab,
  mode: AutofocusMode,
  hasRoot: boolean,
): boolean {
  if (!isAutofocusTab(p)) return false;
  if (mode === "always") return true;
  if (mode === "noRoot") return !hasRoot;
  return false;
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
  // Sidebar view state of this workspace: active view and the explorer snapshot.
  sidebar?: WorkspaceSidebar;
  workspaceRoot?: string;
  fsRoot?: string;
  git?: WorkspaceGitConfig;
  color?: string | null;
  icon?: string;
  groupId?: string;
  scriptPaneId?: string;
  // Workspace-scoped Actions (the global ones live in settings-tools.json) and the one F12 runs.
  actions?: Action[];
  activeAction?: string;
  // The nested tab list under this workspace in the WorkspaceBar is open.
  detailExpanded?: boolean;
};

// Actions with a command: the ones a workspace close would delete. The close-workspace
// dialog warns about them, and the fold-on-empty rule spares a workspace that still has any.
export function actionsToDelete(ws: Workspace): number {
  return ws.actions?.filter((a) => a.command.trim()).length ?? 0;
}

export type ClosedTabEntry = {
  kind: "tab";
  tab: Tab;
  paneId: string;
  workspaceId: string;
  // The tab on its left when it was closed, null if it was the first of its pane.
  prevTabId: string | null;
  // Closing it left the workspace without tabs.
  lastOfWorkspace?: boolean;
  // Tabs closed by one bulk action share it, and one undo brings them all back.
  batchId?: string;
};

// A closed workspace with everything it held. `index` is where it sat in the bar.
export type ClosedWorkspaceEntry = {
  kind: "workspace";
  workspace: Workspace;
  index: number;
  batchId?: string;
};

export type ClosedEntry = ClosedTabEntry | ClosedWorkspaceEntry;
