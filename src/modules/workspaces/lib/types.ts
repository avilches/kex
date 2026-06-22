import type { ExplorerRootMode } from "@/modules/workspaces/lib/explorerRoot";

export type Panel =
  | { id: string; kind: "terminal"; cwd?: string; title?: string; blocks?: boolean;
      locked?: boolean; restoreOnRestart?: boolean; persistentCommand?: string; autofocus?: boolean }
  | { id: string; kind: "editor"; path: string; title?: string; dirty: boolean; preview: boolean; locked?: boolean; autofocus?: boolean; wordWrapOverride?: boolean }
  | { id: string; kind: "browser";         url: string;   title?: string; floating?: boolean }
  | { id: string; kind: "markdown";        path: string;  title?: string }
  | { id: string; kind: "git-diff";        path: string;  repoRoot: string; mode: "-" | "+"; originalPath: string | null; title?: string; locked?: boolean; autofocus?: boolean }
  | { id: string; kind: "git-history";     repoRoot: string; title?: string }
  | { id: string; kind: "git-commit-file"; repoRoot: string; sha: string; path: string; originalPath: string | null; title?: string };

// Panels whose tab can drive the sidebar via the autofocus flag (terminal cwd,
// or the file path for editor / git-diff). Other kinds never carry autofocus.
export type AutofocusPanel = Extract<
  Panel,
  { kind: "terminal" | "editor" | "git-diff" }
>;

export function isAutofocusPanel(p: Panel): p is AutofocusPanel {
  return p.kind === "terminal" || p.kind === "editor" || p.kind === "git-diff";
}

// Lock (prevent close) applies to the same panel kinds that can drive the
// sidebar: terminal, editor and git-diff.
export const isLockablePanel = isAutofocusPanel;

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

export type Workspace = {
  id: string;
  title: string;
  cwd?: string;
  paneTree: SplitNode;
  activePaneId: string;
  explorerRootMode?: ExplorerRootMode;
  pinnedRoot?: string;
  fsRoot?: string;
};
