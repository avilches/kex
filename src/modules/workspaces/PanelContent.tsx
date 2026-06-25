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
  const { workspaceRoot, home } = useEditorChrome();
  const editorViewByExt = usePreferencesStore((s) => s.editorViewByExt);
  const autoSave = usePreferencesStore((s) => s.editorAutoSave);
  const bracketMatching = usePreferencesStore((s) => s.editorBracketMatching);
  const closeBrackets = usePreferencesStore((s) => s.editorCloseBrackets);
  const autocompletion = usePreferencesStore((s) => s.editorAutocompletion);
  const scrollPastEnd = usePreferencesStore((s) => s.editorScrollPastEnd);

  const [currentLanguageName, setCurrentLanguageName] = useState<string>(() =>
    panel.kind === "editor" ? resolveDisplayName(panel.path) : "",
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
  const rawPM = panel.kind === "editor"
    ? (panel.previewMode as "overlay" | "split" | boolean | undefined)
    : panel.kind === "markdown"
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

  switch (panel.kind) {
    case "terminal":
      return (
        <div className="flex h-full w-full flex-col">
          <TerminalPathBar
            panelId={panel.id}
            cwd={panel.cwd ?? ""}
            explorerRoot={explorerRoot}
            home={home}
            onReveal={panel.cwd ? () => callbacks.onFocusOnExplorer?.(panel.cwd as string) : undefined}
          />
          <div className="relative min-h-0 flex-1">
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
          </div>
        </div>
      );

    case "editor": {
      const overrideLang = panel.overrideLanguage ?? null;
      const ismd = overrideLang ? isMarkdownPath(`x.${overrideLang}`) : isMarkdownPath(panel.path);
      const ishtml = overrideLang ? isHtmlPath(`x.${overrideLang}`) : isHtmlPath(panel.path);
      const showPreviewToggle = ismd || ishtml;

      const ext = extOf(panel.path);
      const viewToggles = {
        ext,
        value: resolveEditorView(panel.path, editorViewByExt),
        onChange: (next: EditorViewSettings) =>
          void setEditorViewForExt(ext, next),
        onViewInSettings: () => void openFileTypesSettings(ext || undefined),
      };

      return (
        <Suspense fallback={null}>
          <div className="flex h-full w-full flex-col">
            <EditorPathBar
              path={panel.path}
              workspaceRoot={workspaceRoot}
              home={home}
              onRevealPath={(p) => callbacks.onFocusOnExplorer?.(p)}
              view={showPreviewToggle ? {
                mode: effectivePreviewMode ?? "raw",
                onToggleOverlay: () => callbacks.onToggleOverlayPreview?.(panel.id),
                onToggleSplit: () => callbacks.onToggleSplitPreview?.(panel.id),
                isHtml: ishtml,
              } : undefined}
              viewToggles={effectivePreviewMode == null ? viewToggles : undefined}
              globalToggles={effectivePreviewMode == null ? globalToggles : undefined}
              overrideLanguage={panel.overrideLanguage}
              currentLanguageName={currentLanguageName}
              onLanguageChange={(lang) => {
                const willShowPreview = lang
                  ? isMarkdownPath(`x.${lang}`) || isHtmlPath(`x.${lang}`)
                  : isMarkdownPath(panel.path) || isHtmlPath(panel.path);
                callbacks.onUpdatePanel?.(panel.id, (p) => {
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
                  {ishtml && <HtmlPreviewPane content={liveContent} path={panel.path} />}
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
          <div className="flex h-full w-full flex-col">
            <EditorPathBar
              path={panel.path}
              workspaceRoot={workspaceRoot}
              home={home}
              onRevealPath={(p) => callbacks.onFocusOnExplorer?.(p)}
              view={{
                mode: "overlay",
                onToggleOverlay: () => callbacks.onSetMarkdownView?.(panel.id, "raw"),
                onToggleSplit: () => callbacks.onUpdatePanel?.(panel.id, (p) => {
                  if (p.kind !== "markdown") return p;
                  return { id: p.id, kind: "editor", path: p.path, title: p.title, dirty: false, preview: false, previewMode: "split" };
                }),
              }}
            />
            <div className="relative min-h-0 flex-1">
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
