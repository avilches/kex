import { cn, isMarkdownPath, isHtmlPath } from "@/lib/utils";
import type { EditorPaneHandle } from "@/modules/editor/EditorPane";
import type { GitHistorySearchHandle } from "@/modules/git-history/GitHistoryPane";
import { EditorPathBar, type EditorGlobalToggleKey } from "@/modules/editor";
import { useEditorChrome } from "./EditorChromeContext";
import type { BrowserPaneHandle } from "@/modules/browser/BrowserPane";
import { TerminalPane, type TerminalPaneHandle } from "@/modules/terminal/TerminalPane";
import { TerminalPathBar } from "@/modules/terminal";
import type { SearchAddon } from "@xterm/addon-search";
import { type ComponentType, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { extOf, resolveEditorView, type EditorViewSettings } from "@/modules/editor/lib/editorViewSettings";
import { resolveDisplayName } from "@/modules/editor/lib/languageResolver";
import {
  setEditorAutoSave,
  setEditorAutocompletion,
  setEditorBracketMatching,
  setEditorCloseBrackets,
  setEditorScrollPastEnd,
  setEditorViewForExt,
} from "@/modules/settings/store";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { openFileTypesSettings } from "@/modules/settings/openSettingsWindow";
import type { Tab, ScratchpadState } from "./lib/types";
import type { RevealAction } from "@/modules/explorer/lib/pendingAction";

// TerminalPane is intentionally eager (terminal-first app).
// All other heavy tab types are lazy-loaded to keep the startup bundle lean.
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

export type TabCallbacks = {
  // Terminal callbacks
  onSearchReady?: (panelId: string, addon: SearchAddon) => void;
  onExit?: (panelId: string, code: number) => void;
  onCwd?: (panelId: string, cwd: string) => void;
  onRunningCommand?: (panelId: string, cmd: string | null) => void;
  onScratchpadState?: (panelId: string, state: ScratchpadState) => void;
  registerTerminalHandle?: (panelId: string, handle: TerminalPaneHandle | null) => void;
  // Editor callbacks
  onEditorDirtyChange?: (panelId: string, dirty: boolean) => void;
  onEditorClose?: (panelId: string) => void;
  registerEditorHandle?: (panelId: string, handle: EditorPaneHandle | null) => void;
  // Preview callbacks
  onToggleOverlayPreview?: (panelId: string) => void;
  onToggleSplitPreview?: (panelId: string) => void;
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
  // Tab data update (used by tab bar lock/restore toggles)
  onUpdatePanel?: (panelId: string, updater: (p: Tab) => Tab) => void;
  // File rename (editor/markdown tabs - renames the file on disk)
  onRenameFile?: (panelId: string, newName: string) => void;
  // Reveal an editor/markdown/git file in the explorer tree
  onFocusOnExplorer?: (filePath: string, pendingAction?: RevealAction) => void;
  // Dir-segment context menu actions (editor/markdown path bar)
  onSetAsRoot?: (path: string) => void;
  onNewWorkspaceFromFolder?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onAddToGitignore?: (path: string, isDir: boolean) => void;
};

type Props = {
  tab: Tab;
  visible: boolean;
  focused: boolean;
  callbacks: TabCallbacks;
  onFloatBrowserPanel?: (panelId: string) => void;
  onDockBrowserPanel?: (panelId: string) => void;
  onFocusFloatBrowserPanel?: (panelId: string) => void;
  onNavigateFloatBrowserPanel?: (panelId: string, url: string) => void;
};

export function TabContent({ tab, visible, focused, callbacks, onFloatBrowserPanel, onDockBrowserPanel, onFocusFloatBrowserPanel, onNavigateFloatBrowserPanel }: Props) {
  const terminalRef = useRef<TerminalPaneHandle>(null);
  const editorRef = useRef<EditorPaneHandle>(null);
  const browserRef = useRef<BrowserPaneHandle>(null);
  const { workspaceRoot, home, gitRootPath } = useEditorChrome();
  const editorViewByExt = usePreferencesStore((s) => s.editorViewByExt);
  const autoSave = usePreferencesStore((s) => s.editorAutoSave);
  const bracketMatching = usePreferencesStore((s) => s.editorBracketMatching);
  const closeBrackets = usePreferencesStore((s) => s.editorCloseBrackets);
  const autocompletion = usePreferencesStore((s) => s.editorAutocompletion);
  const scrollPastEnd = usePreferencesStore((s) => s.editorScrollPastEnd);
  const scratchpadInNewTerminals = usePreferencesStore(
    (s) => s.scratchpadInNewTerminals,
  );

  const [currentLanguageName, setCurrentLanguageName] = useState<string>(() =>
    tab.kind === "editor" ? resolveDisplayName(tab.path) : "",
  );

  // Live content state for preview panes - updated via debounced onContentChange
  const [liveContent, setLiveContent] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Derive effectivePreviewMode above the switch so hooks can use it unconditionally.
  // Coerces legacy boolean true (old saved workspace state) to "overlay".
  const rawPM = tab.kind === "editor"
    ? (tab.previewMode as "overlay" | "split" | boolean | undefined)
    : tab.kind === "markdown"
      ? "overlay"
      : undefined;
  const effectivePreviewMode: "overlay" | "split" | undefined =
    rawPM === true ? "overlay" : !rawPM ? undefined : (rawPM as "overlay" | "split");

  const prevEffectivePreviewModeRef = useRef<"overlay" | "split" | undefined>(undefined);
  useEffect(() => {
    const prev = prevEffectivePreviewModeRef.current;
    if (effectivePreviewMode != null && prev == null) {
      const content = editorRef.current?.getContent();
      if (content != null) setLiveContent(content);
    }
    prevEffectivePreviewModeRef.current = effectivePreviewMode;
  }, [effectivePreviewMode]);

  switch (tab.kind) {
    case "terminal":
      return (
        <div className="flex h-full w-full flex-col">
          <TerminalPathBar
            panelId={tab.id}
            cwd={tab.cwd ?? ""}
            home={home}
            workspaceRoot={workspaceRoot}
            gitRootPath={gitRootPath}
            restoreOnRestart={tab.restoreOnRestart}
            persistentCommand={tab.persistentCommand}
            onUpdatePanel={(updater) => callbacks.onUpdatePanel?.(tab.id, updater)}
            onReveal={(p) => callbacks.onFocusOnExplorer?.(p)}
            onSetAsRoot={callbacks.onSetAsRoot}
            onNewWorkspaceFromFolder={callbacks.onNewWorkspaceFromFolder}
            onRevealInTerminal={callbacks.onRevealInTerminal}
            onAddToGitignore={callbacks.onAddToGitignore}
          />
          <div className="relative min-h-0 flex-1">
            <TerminalPane
              ref={(h) => {
                (terminalRef as React.MutableRefObject<TerminalPaneHandle | null>).current = h;
                callbacks.registerTerminalHandle?.(tab.id, h);
              }}
              panelId={tab.id}
              visible={visible}
              focused={focused}
              initialCwd={tab.cwd}
              blocks={tab.blocks}
              restoreOnRestart={tab.restoreOnRestart}
              persistentCommand={tab.persistentCommand}
              initialScratchpad={
                tab.scratchpad ??
                (scratchpadInNewTerminals ? "focused" : "hidden")
              }
              onSearchReady={callbacks.onSearchReady}
              onExit={callbacks.onExit}
              onCwd={callbacks.onCwd}
              onRunningCommand={callbacks.onRunningCommand}
              onScratchpadState={callbacks.onScratchpadState}
            />
          </div>
        </div>
      );

    case "editor": {
      const overrideLang = tab.overrideLanguage ?? null;
      const ismd = overrideLang ? isMarkdownPath(`x.${overrideLang}`) : isMarkdownPath(tab.path);
      const ishtml = overrideLang ? isHtmlPath(`x.${overrideLang}`) : isHtmlPath(tab.path);
      const showPreviewToggle = ismd || ishtml;

      const ext = extOf(tab.path);
      const viewToggles = {
        ext,
        value: resolveEditorView(tab.path, editorViewByExt),
        onChange: (next: EditorViewSettings) =>
          void setEditorViewForExt(ext, next),
        onViewInSettings: () => void openFileTypesSettings(ext || undefined),
      };

      return (
        <Suspense fallback={null}>
          <div className="flex h-full w-full flex-col">
            <EditorPathBar
              path={tab.path}
              panelId={tab.id}
              workspaceRoot={workspaceRoot}
              home={home}
              gitRootPath={gitRootPath}
              onRevealPath={(p: string) => callbacks.onFocusOnExplorer?.(p)}
              onFocusOnExplorer={callbacks.onFocusOnExplorer}
              onRenameFile={callbacks.onRenameFile}
              onSetAsRoot={callbacks.onSetAsRoot}
              onNewWorkspaceFromFolder={callbacks.onNewWorkspaceFromFolder}
              onRevealInTerminal={callbacks.onRevealInTerminal}
              onAddToGitignore={callbacks.onAddToGitignore}
              view={showPreviewToggle ? {
                mode: effectivePreviewMode ?? "raw",
                onToggleOverlay: () => callbacks.onToggleOverlayPreview?.(tab.id),
                onToggleSplit: () => callbacks.onToggleSplitPreview?.(tab.id),
                isHtml: ishtml,
              } : undefined}
              viewToggles={effectivePreviewMode == null ? viewToggles : undefined}
              globalToggles={effectivePreviewMode == null ? globalToggles : undefined}
              overrideLanguage={tab.overrideLanguage}
              currentLanguageName={currentLanguageName}
              onLanguageChange={(lang) => {
                const willShowPreview = lang
                  ? isMarkdownPath(`x.${lang}`) || isHtmlPath(`x.${lang}`)
                  : isMarkdownPath(tab.path) || isHtmlPath(tab.path);
                callbacks.onUpdatePanel?.(tab.id, (p) => {
                  if (p.kind !== "editor") return p;
                  return {
                    ...p,
                    overrideLanguage: lang,
                    previewMode: willShowPreview ? p.previewMode : undefined,
                  };
                });
              }}
            />

            <div className="relative min-h-0 flex-1">
              {/* Editor: always mounted. CSS width/visibility changes per mode. */}
              <div
                className={cn(
                  "absolute inset-y-0 left-0",
                  effectivePreviewMode === "overlay"
                    ? "invisible pointer-events-none right-0"
                    : effectivePreviewMode === "split"
                      ? "right-1/2"
                      : "right-0",
                )}
              >
                <EditorPane
                  ref={(h: EditorPaneHandle | null) => {
                    (editorRef as React.MutableRefObject<EditorPaneHandle | null>).current = h;
                    callbacks.registerEditorHandle?.(tab.id, h);
                  }}
                  path={tab.path}
                  onDirtyChange={(dirty: boolean) =>
                    callbacks.onEditorDirtyChange?.(tab.id, dirty)
                  }
                  onClose={() => callbacks.onEditorClose?.(tab.id)}
                  onContentChange={handleContentChange}
                  overrideLanguage={tab.overrideLanguage}
                  onLanguageResolved={setCurrentLanguageName}
                />
              </div>

              {/* 1px divider in split mode */}
              {effectivePreviewMode === "split" && (
                <div className="absolute inset-y-0 left-1/2 z-20 w-px -translate-x-px bg-border" />
              )}

              {/* Preview: visible in overlay (full) and split (right half) */}
              {(effectivePreviewMode === "overlay" || effectivePreviewMode === "split") && (
                <div
                  className={cn(
                    "absolute inset-y-0 z-10",
                    effectivePreviewMode === "split" ? "right-0" : "inset-0",
                  )}
                  style={effectivePreviewMode === "split" ? { left: "calc(50% + 1px)" } : undefined}
                >
                  {ismd && <MarkdownPreviewPane content={liveContent} />}
                  {ishtml && <HtmlPreviewPane content={liveContent} path={tab.path} />}
                </div>
              )}
            </div>
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
              callbacks.registerBrowserHandle?.(tab.id, h);
            }}
            url={tab.url}
            floating={tab.floating ?? false}
            visible={visible}
            onUrlChange={(url: string) => callbacks.onBrowserUrlChange?.(tab.id, url)}
            onFloat={() => onFloatBrowserPanel?.(tab.id)}
            onDock={() => onDockBrowserPanel?.(tab.id)}
            onFocusFloat={() => onFocusFloatBrowserPanel?.(tab.id)}
            onNavigateFloat={(url: string) => onNavigateFloatBrowserPanel?.(tab.id, url)}
          />
        </Suspense>
      );

    case "markdown":
      return (
        <Suspense fallback={null}>
          <div className="flex h-full w-full flex-col">
            <EditorPathBar
              path={tab.path}
              panelId={tab.id}
              workspaceRoot={workspaceRoot}
              home={home}
              gitRootPath={gitRootPath}
              onRevealPath={(p: string) => callbacks.onFocusOnExplorer?.(p)}
              onFocusOnExplorer={callbacks.onFocusOnExplorer}
              onRenameFile={callbacks.onRenameFile}
              onSetAsRoot={callbacks.onSetAsRoot}
              onNewWorkspaceFromFolder={callbacks.onNewWorkspaceFromFolder}
              onRevealInTerminal={callbacks.onRevealInTerminal}
              onAddToGitignore={callbacks.onAddToGitignore}
              view={{
                mode: "overlay",
                onToggleOverlay: () => callbacks.onSetMarkdownView?.(tab.id, "raw"),
                onToggleSplit: () => callbacks.onUpdatePanel?.(tab.id, (p) => {
                  if (p.kind !== "markdown") return p;
                  return { id: p.id, kind: "editor", path: p.path, title: p.title, dirty: false, preview: false, previewMode: "split", locked: p.locked, autofocus: p.autofocus };
                }),
              }}
            />
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0 invisible pointer-events-none">
                <EditorPane
                  ref={(h: EditorPaneHandle | null) => {
                    (editorRef as React.MutableRefObject<EditorPaneHandle | null>).current = h;
                  }}
                  path={tab.path}
                  onContentChange={handleContentChange}
                  onReady={handleReady}
                />
              </div>
              <div className="absolute inset-0" style={{ zIndex: 5 }}>
                <MarkdownPreviewPane content={liveContent} />
              </div>
            </div>
          </div>
        </Suspense>
      );

    case "git-diff": {
      return (
        <Suspense fallback={null}>
          <GitDiffPane
            source={{ kind: "working", repoRoot: tab.repoRoot, path: tab.path, mode: tab.mode, originalPath: tab.originalPath }}
            active={visible}
            workspaceRoot={workspaceRoot}
            home={home}
            onRevealPath={(p: string) => callbacks.onFocusOnExplorer?.(p)}
          />
        </Suspense>
      );
    }

    case "git-commit-file": {
      return (
        <Suspense fallback={null}>
          <GitDiffPane
            source={{ kind: "commit", repoRoot: tab.repoRoot, sha: tab.sha, path: tab.path, originalPath: tab.originalPath }}
            active={visible}
            workspaceRoot={workspaceRoot}
            home={home}
            onRevealPath={(p: string) => callbacks.onFocusOnExplorer?.(p)}
          />
        </Suspense>
      );
    }

    case "git-history":
      return (
        <Suspense fallback={null}>
          <GitHistoryPane
            repoRoot={tab.repoRoot}
            onOpenCommitFile={(input: CommitFileDiffOpenInput) => callbacks.onOpenCommitFile?.(input)}
            onSearchHandle={(handle: GitHistorySearchHandle | null) => callbacks.onGitHistorySearchHandle?.(tab.id, handle)}
          />
        </Suspense>
      );
  }
}
