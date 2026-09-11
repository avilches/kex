import { ScrollArea } from "@/components/ui/scroll-area";
import { GitDiffPathBar } from "./GitDiffPathBar";
import { GitDiffSplitView } from "./GitDiffSplitView";
import { Spinner } from "@/components/ui/spinner";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { unifiedMergeView } from "@codemirror/merge";
import { foldGutter } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, highlightWhitespace } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  listenFsChanged,
  parentDir,
  watchAdd,
  watchRemove,
} from "@/modules/explorer/lib/watch";
import {
  buildSharedExtensions,
  foldGutterCompartment,
  languageCompartment,
  lineNumbersCompartment,
  lineNumbersExt,
  whitespaceCompartment,
  wrapCompartment,
} from "./lib/extensions";
import {
  fetchCommitDiff,
  fetchWorkingDiff,
  getCachedDiff,
  invalidateDiff,
  workingDiffKey,
  commitDiffKey,
} from "./lib/diffCache";
import { resolveEditorView } from "./lib/editorViewSettings";
import {
  PATCH_PREVIEW_MAX_LINES,
  clampPatchPreview,
  isDiffTooLarge,
} from "./lib/diffSize";
import { resolveLanguage, resolveLanguageSync } from "./lib/languageResolver";
import { useEditorThemeExt } from "./lib/useEditorThemeExt";
import { joinRepoPath } from "./lib/diffRename";

type WorkingSource = {
  kind: "working";
  repoRoot: string;
  path: string;
  mode: "-" | "+";
  originalPath: string | null;
};

type CommitSource = {
  kind: "commit";
  repoRoot: string;
  sha: string;
  path: string;
  originalPath: string | null;
};

type Props = {
  source: WorkingSource | CommitSource;
  chipLabel?: string;
  active: boolean;
  workspaceRoot?: string | null;
  home?: string | null;
  onRevealPath?: (path: string) => void;
};

const READONLY_EXT = [
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
];
export const DIFF_THEME = EditorView.theme({
  "&.cm-merge-b .cm-changedText, .cm-changedText": {
    background: "rgba(110, 200, 120, 0.20) !important",
    borderRadius: "3px",
    padding: "0 1px",
  },
  ".cm-deletedChunk .cm-deletedText, &.cm-merge-b .cm-deletedText": {
    background: "rgba(220, 90, 90, 0.22) !important",
    borderRadius: "3px",
    padding: "0 1px",
  },
  "&.cm-merge-b .cm-changedLine, .cm-changedLine, .cm-inlineChangedLine": {
    backgroundColor: "rgba(110, 200, 120, 0.05) !important",
  },
  ".cm-deletedChunk": {
    backgroundColor: "rgba(220, 90, 90, 0.05) !important",
    paddingTop: "1px",
    paddingBottom: "1px",
  },
  "&.cm-merge-b .cm-changedLineGutter, .cm-changedLineGutter": {
    background: "rgba(110, 200, 120, 0.55) !important",
  },
  ".cm-deletedLineGutter, &.cm-merge-a .cm-changedLineGutter": {
    background: "rgba(220, 90, 90, 0.5) !important",
  },
  ".cm-changeGutter": {
    width: "2px !important",
    paddingLeft: "0 !important",
  },
  ".cm-collapsedLines": {
    backgroundColor: "transparent",
    color: "var(--muted-foreground, #9ca3af)",
    fontSize: "10.5px",
    padding: "2px 8px",
    opacity: 0.7,
  },
});

function countDiffLines(patch: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (let i = 0; i < patch.length; i++) {
    if (i > 0 && patch.charCodeAt(i - 1) !== 10) continue;
    const c = patch.charCodeAt(i);
    if (c === 43 && patch.charCodeAt(i + 1) !== 43) added++;
    else if (c === 45 && patch.charCodeAt(i + 1) !== 45) removed++;
  }
  if (patch.length > 0 && patch.charCodeAt(0) === 43) added++;
  else if (patch.length > 0 && patch.charCodeAt(0) === 45) removed++;
  return { added, removed };
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; originalContent: string; modifiedContent: string; isBinary: boolean; fallbackPatch: string; truncated: boolean }
  | { kind: "error"; message: string };

function cacheKey(source: WorkingSource | CommitSource): string {
  return source.kind === "working"
    ? workingDiffKey(source.repoRoot, source.path, source.mode)
    : commitDiffKey(source.repoRoot, source.sha, source.path);
}

export function isLiveWorkingSource(
  source: WorkingSource | CommitSource,
): source is WorkingSource & { mode: "-" } {
  return source.kind === "working" && source.mode === "-";
}

function errorMessage(err: unknown): string {
  return err && typeof err === "object" && "message" in err
    ? String((err as { message: unknown }).message)
    : String(err);
}

function loadStateFromCache(
  source: WorkingSource | CommitSource,
): LoadState {
  const hit = getCachedDiff(cacheKey(source));
  if (!hit) return { kind: "idle" };
  return {
    kind: "loaded",
    originalContent: hit.originalContent,
    modifiedContent: hit.modifiedContent,
    isBinary: hit.isBinary,
    fallbackPatch: hit.fallbackPatch,
    truncated: hit.truncated,
  };
}

export function GitDiffPane({ source, chipLabel, active, workspaceRoot = null, home = null, onRevealPath }: Props) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const themeExt = useEditorThemeExt();
  const [state, setState] = useState<LoadState>(() =>
    active ? loadStateFromCache(source) : { kind: "idle" },
  );
  const key = cacheKey(source);
  const originalPath = source.originalPath;
  // source is created inline in TabContent and gets a new object identity on every parent render.
  // Stabilize it so the fetch effect only re-runs when the diff content actually changes.
  const stableSource = useMemo(() => source, [key, originalPath]);

  useEffect(() => {
    if (!active) return;
    const cached = loadStateFromCache(stableSource);
    if (cached.kind === "loaded") {
      setState(cached);
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    const promise =
      stableSource.kind === "working"
        ? fetchWorkingDiff(
            stableSource.repoRoot,
            stableSource.path,
            stableSource.mode,
            stableSource.originalPath,
          )
        : fetchCommitDiff(
            stableSource.repoRoot,
            stableSource.sha,
            stableSource.path,
            stableSource.originalPath,
          );
    promise
      .then((res) => {
        if (cancelled) return;
        setState({
          kind: "loaded",
          originalContent: res.originalContent,
          modifiedContent: res.modifiedContent,
          isBinary: res.isBinary,
          fallbackPatch: res.fallbackPatch,
          truncated: res.truncated,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", message: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [active, key, originalPath, stableSource]);

  // Diff content for a working, unstaged source (mode "-") reads the modified
  // side straight off disk (see diff_content in operations.rs), so it goes
  // stale the moment the file changes underneath the open tab. A staged
  // diff's modified side comes from the git index instead, and a commit
  // diff is pinned to a sha: neither needs to watch the filesystem.
  useEffect(() => {
    if (!isLiveWorkingSource(stableSource)) return;
    const dir = parentDir(joinRepoPath(stableSource.repoRoot, stableSource.path));
    watchAdd([dir]);
    return () => watchRemove([dir]);
  }, [stableSource]);

  useEffect(() => {
    if (!isLiveWorkingSource(stableSource)) return;
    const live = stableSource;
    const watchedPath = joinRepoPath(live.repoRoot, live.path).replace(/\\/g, "/");
    let cancelled = false;
    const revalidate = () => {
      invalidateDiff(key);
      fetchWorkingDiff(live.repoRoot, live.path, live.mode, live.originalPath)
        .then((res) => {
          if (cancelled) return;
          setState({
            kind: "loaded",
            originalContent: res.originalContent,
            modifiedContent: res.modifiedContent,
            isBinary: res.isBinary,
            fallbackPatch: res.fallbackPatch,
            truncated: res.truncated,
          });
        })
        .catch((err) => {
          if (cancelled) return;
          setState({ kind: "error", message: errorMessage(err) });
        });
    };
    const unlistenWritten = getCurrentWebviewWindow().listen<{ path: string }>(
      "fs:file-written",
      (event) => {
        if (event.payload.path.replace(/\\/g, "/") === watchedPath) revalidate();
      },
    );
    const unlistenChanged = listenFsChanged((paths) => {
      if (paths.some((p) => p.replace(/\\/g, "/") === watchedPath)) revalidate();
    });
    return () => {
      cancelled = true;
      void unlistenWritten.then((un) => un());
      void unlistenChanged.then((un) => un());
    };
  }, [key, stableSource]);

  const path = source.path;
  const repoRoot = source.repoRoot;
  const mode = source.kind === "working" ? source.mode : "+";
  const absPath = joinRepoPath(repoRoot, path);
  const absOriginalPath = originalPath ? joinRepoPath(repoRoot, originalPath) : null;
  const loaded = state.kind === "loaded" ? state : null;
  const originalContent = loaded?.originalContent ?? "";
  const modifiedContent = loaded?.modifiedContent ?? "";
  const isBinary = loaded?.isBinary ?? false;
  const fallbackPatch = loaded?.fallbackPatch ?? "";
  const truncated = loaded?.truncated ?? false;

  const isTooLarge = useMemo(
    () => isDiffTooLarge(originalContent, modifiedContent),
    [originalContent, modifiedContent],
  );
  const useFallback = isBinary || isTooLarge;

  const editorViewByExt = usePreferencesStore((s) => s.editorViewByExt);
  const view = resolveEditorView(path, editorViewByExt);

  const initialLang = useMemo(() => resolveLanguageSync(path), [path]);
  const diffViewMode = usePreferencesStore((s) => s.diffViewMode);
  const extensions = useMemo(() => {
    const s = usePreferencesStore.getState();
    const v0 = resolveEditorView(path, s.editorViewByExt);
    return [
      ...buildSharedExtensions({
        view: v0,
        scrollPastEnd: s.editorScrollPastEnd,
        highlightActiveLine: s.editorHighlightActiveLine,
        bracketMatching: s.editorBracketMatching,
        closeBrackets: s.editorCloseBrackets,
        autocompletion: s.editorAutocompletion,
        cursorBlink: s.editorCursorBlink,
        cursorBlinkRate: s.editorCursorBlinkRate,
        cursorStyle: s.editorCursorStyle,
      }),
      languageCompartment.of(initialLang?.ext ?? []),
      wrapCompartment.of(v0.wrap ? EditorView.lineWrapping : []),
      ...READONLY_EXT,
      unifiedMergeView({ original: originalContent, mergeControls: false, highlightChanges: true, gutter: true, syntaxHighlightDeletions: true, collapseUnchanged: { margin: 3, minSize: 6 } }),
      DIFF_THEME,
    ];
  }, [originalContent, initialLang, path]);

  useEffect(() => {
    const v = cmRef.current?.view; if (!v) return;
    v.dispatch({ effects: wrapCompartment.reconfigure(view.wrap ? EditorView.lineWrapping : []) });
  }, [view.wrap]);
  useEffect(() => {
    const v = cmRef.current?.view; if (!v) return;
    v.dispatch({ effects: lineNumbersCompartment.reconfigure(lineNumbersExt(view.lineNumbers)) });
  }, [view.lineNumbers]);
  useEffect(() => {
    const v = cmRef.current?.view; if (!v) return;
    v.dispatch({ effects: foldGutterCompartment.reconfigure(view.foldGutter ? foldGutter() : []) });
  }, [view.foldGutter]);
  useEffect(() => {
    const v = cmRef.current?.view; if (!v) return;
    v.dispatch({ effects: whitespaceCompartment.reconfigure(view.whitespace ? highlightWhitespace() : []) });
  }, [view.whitespace]);

  // Resolve and apply syntax highlighting asynchronously when the language pack
  // isn't cached yet. This must wait until the editor is actually mounted
  // (state === "loaded"): the pane renders a spinner while the diff loads, so if
  // the language import resolved first the view would be null and the reconfigure
  // would be silently dropped — leaving the diff unhighlighted until a remount.
  // Keying on `state.kind` re-runs this once the view exists.
  useEffect(() => {
    if (useFallback || initialLang) return;
    if (state.kind !== "loaded") return;
    let cancelled = false;
    resolveLanguage(path).then((res) => {
      if (cancelled) return;
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: languageCompartment.reconfigure(res?.ext ?? []),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [useFallback, path, initialLang, state.kind]);

  const stats = useMemo(
    () => (useFallback ? countDiffLines(fallbackPatch) : { added: 0, removed: 0 }),
    [useFallback, fallbackPatch],
  );

  const patchPreview = useMemo(
    () => clampPatchPreview(fallbackPatch),
    [fallbackPatch],
  );

  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border border-border/60 bg-background">
      <GitDiffPathBar
        path={absPath}
        originalPath={absOriginalPath}
        repoRoot={repoRoot}
        mode={mode}
        chipLabel={chipLabel}
        useFallback={useFallback}
        isBinary={isBinary}
        isTooLarge={isTooLarge}
        truncated={truncated}
        stats={stats}
        view={view}
        diffViewMode={diffViewMode}
        workspaceRoot={workspaceRoot}
        home={home}
        onRevealPath={onRevealPath ?? (() => {})}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        {state.kind === "loading" || state.kind === "idle" ? (
          <div className="flex h-full items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <Spinner className="size-3" />
            Loading diff...
          </div>
        ) : state.kind === "error" ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[11.5px] text-destructive">
            {state.message}
          </div>
        ) : useFallback ? (
          <ScrollArea className="h-full">
            <pre className="whitespace-pre-wrap wrap-break-word p-4 font-mono text-[12px] leading-relaxed text-muted-foreground">
              {patchPreview.text || "Diff preview is not available for this file."}
            </pre>
            {patchPreview.hiddenLines > 0 ? (
              <div className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
                Preview limited to the first {PATCH_PREVIEW_MAX_LINES} lines (
                {patchPreview.hiddenLines} more). Open the file to see the full diff.
              </div>
            ) : null}
          </ScrollArea>
        ) : diffViewMode === "split" ? (
          <GitDiffSplitView
            path={path}
            originalContent={originalContent}
            modifiedContent={modifiedContent}
            wrap={view.wrap}
            lineNumbers={view.lineNumbers}
            themeExt={themeExt}
          />
        ) : (
          <CodeMirror
            ref={cmRef}
            value={modifiedContent}
            theme={themeExt}
            extensions={extensions}
            editable={false}
            height="100%"
            className="h-full"
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: false,
              highlightActiveLineGutter: false,
              bracketMatching: false,
              closeBrackets: false,
              autocompletion: false,
              searchKeymap: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
