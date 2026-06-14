import { isMarkdownPath } from "@/lib/utils";
import type { EditorPaneHandle } from "@/modules/editor/EditorPane";
import type { GitHistorySearchHandle } from "@/modules/git-history/GitHistoryPane";
import { MarkdownViewToggle } from "@/modules/markdown/MarkdownViewToggle";
import type { PreviewPaneHandle } from "@/modules/preview/PreviewPane";
import { TerminalPane, type TerminalPaneHandle } from "@/modules/terminal/TerminalPane";
import type { SearchAddon } from "@xterm/addon-search";
import { type ComponentType, lazy, Suspense, useRef } from "react";
import type { Panel } from "./lib/types";

// TerminalPane is intentionally eager (terminal-first app).
// All other heavy panel types are lazy-loaded to keep the startup bundle lean.
const EditorPane = lazy(() =>
  import("@/modules/editor/EditorPane").then((m) => ({ default: m.EditorPane as ComponentType<any> })),
);
const GitDiffPane = lazy(() =>
  import("@/modules/editor/GitDiffPane").then((m) => ({ default: m.GitDiffPane as ComponentType<any> })),
);
const MarkdownPreviewPane = lazy(() =>
  import("@/modules/markdown/MarkdownPreviewPane").then((m) => ({ default: m.MarkdownPreviewPane as ComponentType<any> })),
);
const PreviewPane = lazy(() =>
  import("@/modules/preview/PreviewPane").then((m) => ({ default: m.PreviewPane as ComponentType<any> })),
);
const GitHistoryPane = lazy(() =>
  import("@/modules/git-history/GitHistoryPane").then((m) => ({ default: m.GitHistoryPane as ComponentType<any> })),
);

type CommitFileDiffOpenInput = {
  repoRoot: string;
  sha: string;
  shortSha: string;
  subject: string;
  path: string;
  originalPath: string | null;
};

export type PanelCallbacks = {
  // Terminal callbacks
  onSearchReady?: (panelId: string, addon: SearchAddon) => void;
  onExit?: (panelId: string, code: number) => void;
  onCwd?: (panelId: string, cwd: string) => void;
  onRunningCommand?: (panelId: string, cmd: string | null) => void;
  registerTerminalHandle?: (panelId: string, handle: TerminalPaneHandle | null) => void;
  // Editor callbacks
  onEditorDirtyChange?: (panelId: string, dirty: boolean) => void;
  onEditorClose?: (panelId: string) => void;
  registerEditorHandle?: (panelId: string, handle: EditorPaneHandle | null) => void;
  // Markdown callbacks
  onSetMarkdownView?: (panelId: string, mode: "rendered" | "raw") => void;
  // Preview callbacks
  onPreviewUrlChange?: (panelId: string, url: string) => void;
  registerPreviewHandle?: (panelId: string, handle: PreviewPaneHandle | null) => void;
  // Git history callbacks
  onOpenCommitFile?: (input: CommitFileDiffOpenInput) => void;
  onGitHistorySearchHandle?: (panelId: string, handle: GitHistorySearchHandle | null) => void;
};

type Props = {
  panel: Panel;
  visible: boolean;
  focused: boolean;
  callbacks: PanelCallbacks;
};

export function PanelContent({ panel, visible, focused, callbacks }: Props) {
  const terminalRef = useRef<TerminalPaneHandle>(null);
  const editorRef = useRef<EditorPaneHandle>(null);
  const previewRef = useRef<PreviewPaneHandle>(null);

  switch (panel.kind) {
    case "terminal":
      return (
        <TerminalPane
          ref={(h) => {
            (terminalRef as React.MutableRefObject<TerminalPaneHandle | null>).current = h;
            callbacks.registerTerminalHandle?.(panel.id, h);
          }}
          panelId={panel.id}
          visible={visible}
          focused={focused}
          initialCwd={panel.cwd}
          blocks={panel.blocks}
          onSearchReady={callbacks.onSearchReady}
          onExit={callbacks.onExit}
          onCwd={callbacks.onCwd}
          onRunningCommand={callbacks.onRunningCommand}
        />
      );

    case "editor":
      return (
        <Suspense fallback={null}>
          <div className="relative h-full w-full">
            {isMarkdownPath(panel.path) && (
              <MarkdownViewToggle
                mode="raw"
                onChange={(mode) => callbacks.onSetMarkdownView?.(panel.id, mode)}
                renderedDisabled={panel.dirty}
                renderedHint="Save to preview"
              />
            )}
            <EditorPane
              ref={(h: EditorPaneHandle | null) => {
                (editorRef as React.MutableRefObject<EditorPaneHandle | null>).current = h;
                callbacks.registerEditorHandle?.(panel.id, h);
              }}
              path={panel.path}
              onDirtyChange={(dirty: boolean) => callbacks.onEditorDirtyChange?.(panel.id, dirty)}
              onClose={() => callbacks.onEditorClose?.(panel.id)}
            />
          </div>
        </Suspense>
      );

    case "preview":
      return (
        <Suspense fallback={null}>
          <PreviewPane
            ref={(h: PreviewPaneHandle | null) => {
              (previewRef as React.MutableRefObject<PreviewPaneHandle | null>).current = h;
              callbacks.registerPreviewHandle?.(panel.id, h);
            }}
            url={panel.url}
            visible={visible}
            onUrlChange={(url: string) => callbacks.onPreviewUrlChange?.(panel.id, url)}
          />
        </Suspense>
      );

    case "markdown":
      return (
        <Suspense fallback={null}>
          <MarkdownPreviewPane
            path={panel.path}
            visible={visible}
            onSetView={(mode: "rendered" | "raw") => callbacks.onSetMarkdownView?.(panel.id, mode)}
          />
        </Suspense>
      );

    case "git-diff":
      return (
        <Suspense fallback={null}>
          <GitDiffPane
            source={{
              kind: "working",
              repoRoot: panel.repoRoot,
              path: panel.path,
              mode: panel.mode,
              originalPath: panel.originalPath,
            }}
            active={visible}
          />
        </Suspense>
      );

    case "git-commit-file":
      return (
        <Suspense fallback={null}>
          <GitDiffPane
            source={{
              kind: "commit",
              repoRoot: panel.repoRoot,
              sha: panel.sha,
              path: panel.path,
              originalPath: panel.originalPath,
            }}
            active={visible}
          />
        </Suspense>
      );

    case "git-history":
      return (
        <Suspense fallback={null}>
          <GitHistoryPane
            repoRoot={panel.repoRoot}
            onOpenCommitFile={(input: CommitFileDiffOpenInput) => callbacks.onOpenCommitFile?.(input)}
            onSearchHandle={(handle: GitHistorySearchHandle | null) => callbacks.onGitHistorySearchHandle?.(panel.id, handle)}
          />
        </Suspense>
      );
  }
}
