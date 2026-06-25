import { isMarkdownPath, isHtmlPath } from "@/lib/utils";
import type { EditorPaneHandle } from "@/modules/editor/EditorPane";
import type { GitHistorySearchHandle } from "@/modules/git-history/GitHistoryPane";
import { EditorOverlayBar, type EditorGlobalToggleKey } from "@/modules/editor";
import type { BrowserPaneHandle } from "@/modules/browser/BrowserPane";
import { TerminalPane, type TerminalPaneHandle } from "@/modules/terminal/TerminalPane";
import type { SearchAddon } from "@xterm/addon-search";
import { type ComponentType, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { extOf, resolveEditorView, type EditorViewSettings } from "@/modules/editor/lib/editorViewSettings";
import {
  setEditorAutoSave,
  setEditorAutocompletion,
  setEditorBracketMatching,
  setEditorCloseBrackets,
  setEditorScrollPastEnd,
  setEditorViewForExt,
} from "@/modules/settings/store";
import { usePreferencesStore } from "@/modules/settings/preferences";
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
const HtmlPreviewPane = lazy(() =>
  import("@/modules/html-preview/HtmlPreviewPane").then((m) => ({ default: m.HtmlPreviewPane as ComponentType<any> })),
);
const BrowserPane = lazy(() =>
  import("@/modules/browser/BrowserPane").then((m) => ({ default: m.BrowserPane as ComponentType<any> })),
);
const GitHistoryPane = lazy(() =>
  import("@/modules/git-history/GitHistoryPane").then((m) => ({ default: m.GitHistoryPane as ComponentType<any> })),
);

const GLOBAL_TOGGLE_SETTERS: Record<
  EditorGlobalToggleKey,
  (value: boolean) => Promise<void>
> = {
  autoSave: setEditorAutoSave,
  scrollPastEnd: setEditorScrollPastEnd,
  bracketMatching: setEditorBracketMatching,
  closeBrackets: setEditorCloseBrackets,
  autocompletion: setEditorAutocompletion,
};

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
  // Preview callbacks
  onTogglePreview?: (panelId: string) => void;
  // Markdown callbacks
  onSetMarkdownView?: (panelId: string, mode: "rendered" | "raw") => void;
  // Browser callbacks
  onBrowserUrlChange?: (panelId: string, url: string) => void;
  registerBrowserHandle?: (panelId: string, handle: BrowserPaneHandle | null) => void;
  // Git history callbacks
  onOpenCommitFile?: (input: CommitFileDiffOpenInput) => void;
  onGitHistorySearchHandle?: (panelId: string, handle: GitHistorySearchHandle | null) => void;
  // Tab rename
  onRenamePanel?: (panelId: string, title: string | undefined) => void;
  // Panel data update (used by tab bar lock/restore toggles)
  onUpdatePanel?: (panelId: string, updater: (p: Panel) => Panel) => void;
  // File rename (editor/markdown tabs - renames the file on disk)
  onRenameFile?: (panelId: string, newName: string) => void;
  // Reveal an editor/markdown/git file in the explorer tree
  onFocusOnExplorer?: (filePath: string) => void;
};

type Props = {
  panel: Panel;
  visible: boolean;
  focused: boolean;
  callbacks: PanelCallbacks;
  onFloatBrowserPanel?: (panelId: string) => void;
  onDockBrowserPanel?: (panelId: string) => void;
  onFocusFloatBrowserPanel?: (panelId: string) => void;
  onNavigateFloatBrowserPanel?: (panelId: string, url: string) => void;
};

export function PanelContent({ panel, visible, focused, callbacks, onFloatBrowserPanel, onDockBrowserPanel, onFocusFloatBrowserPanel, onNavigateFloatBrowserPanel }: Props) {
  const terminalRef = useRef<TerminalPaneHandle>(null);
  const editorRef = useRef<EditorPaneHandle>(null);
  const browserRef = useRef<BrowserPaneHandle>(null);
  const editorViewByExt = usePreferencesStore((s) => s.editorViewByExt);
  const autoSave = usePreferencesStore((s) => s.editorAutoSave);
  const bracketMatching = usePreferencesStore((s) => s.editorBracketMatching);
  const closeBrackets = usePreferencesStore((s) => s.editorCloseBrackets);
  const autocompletion = usePreferencesStore((s) => s.editorAutocompletion);
  const scrollPastEnd = usePreferencesStore((s) => s.editorScrollPastEnd);

  const [currentLanguageName, setCurrentLanguageName] = useState<string>("");

  // Live content state for preview panes - updated via debounced onContentChange
  const [liveContent, setLiveContent] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPreviewModeRef = useRef(false);

  const handleContentChange = useCallback((content: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setLiveContent(content), 300);
  }, []);

  // Seed liveContent immediately when EditorPane first loads the file from disk
  // (onContentChange only fires on user edits, not on initial load).
  const handleReady = useCallback((initialContent: string) => {
    setLiveContent(initialContent);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Derive previewMode: true for editor panels with previewMode flag, always true for kind:"markdown"
  const previewMode =
    panel.kind === "editor"
      ? (panel.previewMode ?? false)
      : panel.kind === "markdown";

  // Seed liveContent from editor buffer when preview mode first activates
  useEffect(() => {
    if (previewMode && !prevPreviewModeRef.current) {
      const content = editorRef.current?.getContent();
      if (content != null) setLiveContent(content);
    }
    prevPreviewModeRef.current = previewMode;
  }, [previewMode]);

  const globalToggles = {
    value: {
      autoSave,
      scrollPastEnd,
      bracketMatching,
      closeBrackets,
      autocompletion,
    },
    onToggle: (key: EditorGlobalToggleKey, value: boolean) =>
      void GLOBAL_TOGGLE_SETTERS[key](value),
  };

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
          restoreOnRestart={panel.restoreOnRestart}
          persistentCommand={panel.persistentCommand}
          onSearchReady={callbacks.onSearchReady}
          onExit={callbacks.onExit}
          onCwd={callbacks.onCwd}
          onRunningCommand={callbacks.onRunningCommand}
        />
      );

    case "editor": {
      const ismd = isMarkdownPath(panel.path);
      const ishtml = isHtmlPath(panel.path);
      const showPreviewToggle = ismd || ishtml;

      const viewToggles = {
        ext: extOf(panel.path),
        value: resolveEditorView(panel.path, editorViewByExt),
        onChange: (next: EditorViewSettings) =>
          void setEditorViewForExt(extOf(panel.path), next),
      };

      return (
        <Suspense fallback={null}>
          <div className="relative h-full w-full">
            <EditorOverlayBar
              view={
                showPreviewToggle
                  ? {
                      mode: previewMode ? "rendered" : "raw",
                      onChange: () => callbacks.onTogglePreview?.(panel.id),
                      isHtml: ishtml,
                    }
                  : undefined
              }
              viewToggles={!previewMode ? viewToggles : undefined}
              globalToggles={!previewMode ? globalToggles : undefined}
              overrideLanguage={panel.overrideLanguage}
              currentLanguageName={currentLanguageName}
              onLanguageChange={(lang) =>
                callbacks.onUpdatePanel?.(panel.id, (p) => ({
                  ...p,
                  overrideLanguage: lang,
                }))
              }
            />
            <div
              className={
                previewMode
                  ? "absolute inset-0 invisible pointer-events-none"
                  : "h-full w-full"
              }
            >
              <EditorPane
                ref={(h: EditorPaneHandle | null) => {
                  (editorRef as React.MutableRefObject<EditorPaneHandle | null>).current = h;
                  callbacks.registerEditorHandle?.(panel.id, h);
                }}
                path={panel.path}
                onDirtyChange={(dirty: boolean) =>
                  callbacks.onEditorDirtyChange?.(panel.id, dirty)
                }
                onClose={() => callbacks.onEditorClose?.(panel.id)}
                onContentChange={handleContentChange}
                overrideLanguage={panel.overrideLanguage}
                onLanguageResolved={setCurrentLanguageName}
              />
            </div>
            {previewMode && ismd && (
              <div className="absolute inset-0" style={{ zIndex: 5 }}>
                <MarkdownPreviewPane content={liveContent} />
              </div>
            )}
            {previewMode && ishtml && (
              <div className="absolute inset-0" style={{ zIndex: 5 }}>
                <HtmlPreviewPane content={liveContent} path={panel.path} />
              </div>
            )}
          </div>
        </Suspense>
      );
    }

    case "browser":
      return (
        <Suspense fallback={null}>
          <BrowserPane
            ref={(h: BrowserPaneHandle | null) => {
              (browserRef as React.MutableRefObject<BrowserPaneHandle | null>).current = h;
              callbacks.registerBrowserHandle?.(panel.id, h);
            }}
            url={panel.url}
            floating={panel.floating ?? false}
            visible={visible}
            onUrlChange={(url: string) => callbacks.onBrowserUrlChange?.(panel.id, url)}
            onFloat={() => onFloatBrowserPanel?.(panel.id)}
            onDock={() => onDockBrowserPanel?.(panel.id)}
            onFocusFloat={() => onFocusFloatBrowserPanel?.(panel.id)}
            onNavigateFloat={(url: string) => onNavigateFloatBrowserPanel?.(panel.id, url)}
          />
        </Suspense>
      );

    case "markdown":
      return (
        <Suspense fallback={null}>
          <div className="relative h-full w-full">
            <EditorOverlayBar
              view={{
                mode: "rendered",
                onChange: (mode: "rendered" | "raw") =>
                  callbacks.onSetMarkdownView?.(panel.id, mode),
              }}
            />
            <div className="absolute inset-0 invisible pointer-events-none">
              <EditorPane
                ref={(h: EditorPaneHandle | null) => {
                  (editorRef as React.MutableRefObject<EditorPaneHandle | null>).current = h;
                }}
                path={panel.path}
                onContentChange={handleContentChange}
                onReady={handleReady}
              />
            </div>
            <div className="absolute inset-0" style={{ zIndex: 5 }}>
              <MarkdownPreviewPane content={liveContent} />
            </div>
          </div>
        </Suspense>
      );

    case "git-diff": {
      return (
        <Suspense fallback={null}>
          <GitDiffPane
            source={{ kind: "working", repoRoot: panel.repoRoot, path: panel.path, mode: panel.mode, originalPath: panel.originalPath }}
            active={visible}
          />
        </Suspense>
      );
    }

    case "git-commit-file": {
      return (
        <Suspense fallback={null}>
          <GitDiffPane
            source={{ kind: "commit", repoRoot: panel.repoRoot, sha: panel.sha, path: panel.path, originalPath: panel.originalPath }}
            active={visible}
          />
        </Suspense>
      );
    }

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
