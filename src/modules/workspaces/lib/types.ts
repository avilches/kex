export type Panel =
  | { id: string; kind: "terminal"; cwd?: string; title?: string; blocks?: boolean;
      locked?: boolean; restoreOnRestart?: boolean; persistentCommand?: string }
  | { id: string; kind: "editor"; path: string; title?: string; dirty: boolean; preview: boolean; locked?: boolean; explorerRoot?: string }
  | { id: string; kind: "browser";         url: string;   title?: string; floating?: boolean }
  | { id: string; kind: "markdown";        path: string;  title?: string; explorerRoot?: string }
  | { id: string; kind: "git-diff";        path: string;  repoRoot: string; mode: "-" | "+"; originalPath: string | null; title?: string }
  | { id: string; kind: "git-history";     repoRoot: string; title?: string }
  | { id: string; kind: "git-commit-file"; repoRoot: string; sha: string; path: string; originalPath: string | null; title?: string };

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
};
