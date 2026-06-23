import { usePreferencesStore } from "@/modules/settings/preferences";
import { redo, undo } from "@codemirror/commands";
import { bracketMatching, foldGutter } from "@codemirror/language";
import {
  findNext,
  findPrevious,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { type Extension } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightWhitespace,
  keymap,
  scrollPastEnd,
} from "@codemirror/view";
import { autocompletion, closeBrackets } from "@codemirror/autocomplete";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { pathBasename } from "@/lib/pathUtils";
import {
  activeLineCompartment,
  autocompletionCompartment,
  bracketMatchingCompartment,
  buildSharedExtensions,
  closeBracketsCompartment,
  cursorBlinkCompartment,
  cursorStyleCompartment,
  foldGutterCompartment,
  indentCompartment,
  indentExt,
  languageCompartment,
  lineNumbersCompartment,
  lineNumbersExt,
  scrollPastEndCompartment,
  whitespaceCompartment,
  wrapCompartment,
} from "./lib/extensions";
import { resolveEditorView } from "./lib/editorViewSettings";
import { resolveLanguage } from "./lib/languageResolver";
import { useEditorThemeExt } from "./lib/useEditorThemeExt";
import { useDocument } from "./lib/useDocument";
import { cursorBlinkExt, cursorStyleExt } from "./lib/cursorExtensions";

export type EditorPaneHandle = {
  setQuery: (q: string) => void;
  findNext: () => void;
  findPrevious: () => void;
  clearQuery: () => void;
  focus: () => void;
  /** Persist the buffer to disk. No-op if the document is not dirty. */
  save: () => Promise<void>;
  getSelection: () => string | null;
  getPath: () => string;
  /** Re-read the file from disk. Skips silently if the buffer is dirty. */
  reload: () => boolean;
  /** Move the cursor to a 1-based line and center it, once content is ready. */
  gotoLine: (line: number) => void;
  /** Apply CodeMirror's undo/redo commands. */
  undo: () => void;
  redo: () => void;
  /** Current buffer text, or null when the view is not mounted yet. */
  getContent: () => string | null;
  /** Insert text at the end of the document as a normal edit (marks dirty). */
  insertAtEnd: (text: string) => void;
};

type Props = {
  path: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const EditorPane = forwardRef<EditorPaneHandle, Props>(
  function EditorPane({ path, onDirtyChange, onSaved }, ref) {
    const { doc, onChange, save, reload } = useDocument({
      path,
      onDirtyChange,
    });
    const reloadRef = useRef(reload);
    reloadRef.current = reload;
    const cmRef = useRef<ReactCodeMirrorRef>(null);
    const editorViewByExt = usePreferencesStore((s) => s.editorViewByExt);
    const scrollPastEndPref = usePreferencesStore((s) => s.editorScrollPastEnd);
    const highlightActiveLinePref = usePreferencesStore((s) => s.editorHighlightActiveLine);
    const bracketMatchingPref = usePreferencesStore((s) => s.editorBracketMatching);
    const closeBracketsPref = usePreferencesStore((s) => s.editorCloseBrackets);
    const autocompletionPref = usePreferencesStore((s) => s.editorAutocompletion);
    const cursorBlinkPref = usePreferencesStore((s) => s.editorCursorBlink);
    const cursorStylePref = usePreferencesStore((s) => s.editorCursorStyle);
    const languageRef = useRef<string | null>(null);
    const themeExt = useEditorThemeExt();

    const view = resolveEditorView(path, editorViewByExt);

    // Stabilize save + onSaved via refs so the extensions array never changes
    // identity — a new identity makes @uiw/react-codemirror reconfigure the
    // whole state, wiping the language compartment.
    const saveRef = useRef(save);
    saveRef.current = save;
    const onSavedRef = useRef(onSaved);
    onSavedRef.current = onSaved;

    const pathRef = useRef(path);
    pathRef.current = path;

    const pendingLineRef = useRef<number | null>(null);
    const statusRef = useRef(doc.status);
    statusRef.current = doc.status;

    const applyPendingGoto = useCallback(() => {
      const cmView = cmRef.current?.view;
      const line = pendingLineRef.current;
      if (!cmView || line == null || statusRef.current !== "ready") return;
      const target = Math.max(1, Math.min(line, cmView.state.doc.lines));
      const at = cmView.state.doc.line(target).from;
      cmView.dispatch({
        selection: { anchor: at },
        effects: EditorView.scrollIntoView(at, { y: "center" }),
      });
      cmView.focus();
      pendingLineRef.current = null;
    }, []);

    useEffect(() => {
      if (doc.status === "ready") applyPendingGoto();
    }, [doc.status, applyPendingGoto]);

    const extensions = useMemo(
      () => {
        const s = usePreferencesStore.getState();
        const v0 = resolveEditorView(pathRef.current, s.editorViewByExt);
        return [
          ...buildSharedExtensions({
            view: v0,
            scrollPastEnd: s.editorScrollPastEnd,
            highlightActiveLine: s.editorHighlightActiveLine,
            bracketMatching: s.editorBracketMatching,
            closeBrackets: s.editorCloseBrackets,
            autocompletion: s.editorAutocompletion,
            cursorBlink: s.editorCursorBlink,
            cursorStyle: s.editorCursorStyle,
          }),
          languageCompartment.of([]),
          wrapCompartment.of(v0.wrap ? EditorView.lineWrapping : []),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                void (async () => {
                  await saveRef.current();
                  onSavedRef.current?.();
                })();
                return true;
              },
            },
          ]),
        ];
      },
      [],
    );

    useEffect(() => {
      const v = cmRef.current?.view;
      if (!v) return;
      v.dispatch({ effects: wrapCompartment.reconfigure(view.wrap ? EditorView.lineWrapping : []) });
    }, [view.wrap]);

    useEffect(() => {
      const v = cmRef.current?.view;
      if (!v) return;
      v.dispatch({ effects: lineNumbersCompartment.reconfigure(lineNumbersExt(view.lineNumbers)) });
    }, [view.lineNumbers]);

    useEffect(() => {
      const v = cmRef.current?.view;
      if (!v) return;
      v.dispatch({ effects: foldGutterCompartment.reconfigure(view.foldGutter ? foldGutter() : []) });
    }, [view.foldGutter]);

    useEffect(() => {
      const v = cmRef.current?.view;
      if (!v) return;
      v.dispatch({ effects: whitespaceCompartment.reconfigure(view.whitespace ? highlightWhitespace() : []) });
    }, [view.whitespace]);

    useEffect(() => {
      const v = cmRef.current?.view;
      if (!v) return;
      v.dispatch({ effects: indentCompartment.reconfigure(indentExt(view.indentSize, view.indentWithTabs)) });
    }, [view.indentSize, view.indentWithTabs]);

    useEffect(() => {
      const v = cmRef.current?.view;
      if (!v) return;
      v.dispatch({ effects: scrollPastEndCompartment.reconfigure(scrollPastEndPref ? scrollPastEnd() : []) });
    }, [scrollPastEndPref]);

    useEffect(() => {
      const v = cmRef.current?.view;
      if (!v) return;
      v.dispatch({ effects: activeLineCompartment.reconfigure(highlightActiveLinePref ? highlightActiveLine() : []) });
    }, [highlightActiveLinePref]);

    useEffect(() => {
      const v = cmRef.current?.view;
      if (!v) return;
      v.dispatch({ effects: bracketMatchingCompartment.reconfigure(bracketMatchingPref ? bracketMatching() : []) });
    }, [bracketMatchingPref]);

    useEffect(() => {
      const v = cmRef.current?.view;
      if (!v) return;
      v.dispatch({ effects: closeBracketsCompartment.reconfigure(closeBracketsPref ? closeBrackets() : []) });
    }, [closeBracketsPref]);

    useEffect(() => {
      const v = cmRef.current?.view;
      if (!v) return;
      v.dispatch({ effects: autocompletionCompartment.reconfigure(autocompletionPref ? autocompletion() : []) });
    }, [autocompletionPref]);

    useEffect(() => {
      const v = cmRef.current?.view;
      if (!v) return;
      v.dispatch({ effects: cursorBlinkCompartment.reconfigure(cursorBlinkExt(cursorBlinkPref)) });
    }, [cursorBlinkPref]);

    useEffect(() => {
      const v = cmRef.current?.view;
      if (!v) return;
      v.dispatch({ effects: cursorStyleCompartment.reconfigure(cursorStyleExt(cursorStylePref)) });
    }, [cursorStylePref]);

    useEffect(() => {
      const ext = path.split(".").pop()?.toLowerCase() ?? null;
      languageRef.current = ext;
      if (doc.status !== "ready") return;
      let cancelled = false;
      const resolve = async (): Promise<Extension> => {
        if (path.toLowerCase().endsWith(".kex-theme")) {
          const [{ json }, { colorSwatches }] = await Promise.all([
            import("@codemirror/lang-json"),
            import("./lib/colorSwatches"),
          ]);
          return [json(), colorSwatches()];
        }
        return (await resolveLanguage(path)) ?? [];
      };
      void resolve().then((extension) => {
        if (cancelled) return;
        const v = cmRef.current?.view;
        if (!v) return;
        v.dispatch({
          effects: languageCompartment.reconfigure(extension),
        });
      });
      return () => {
        cancelled = true;
      };
    }, [path, doc.status]);

    useImperativeHandle(
      ref,
      () => ({
        setQuery: (q: string) => {
          const v = cmRef.current?.view;
          if (!v) return;
          v.dispatch({
            effects: setSearchQuery.of(
              new SearchQuery({ search: q, caseSensitive: false }),
            ),
          });
          if (q) findNext(v);
        },
        findNext: () => {
          const v = cmRef.current?.view;
          if (v) findNext(v);
        },
        findPrevious: () => {
          const v = cmRef.current?.view;
          if (v) findPrevious(v);
        },
        clearQuery: () => {
          const v = cmRef.current?.view;
          if (!v) return;
          v.dispatch({
            effects: setSearchQuery.of(new SearchQuery({ search: "" })),
          });
        },
        focus: () => {
          cmRef.current?.view?.focus();
        },
        save: async () => {
          await saveRef.current();
          onSavedRef.current?.();
        },
        getSelection: () => {
          const v = cmRef.current?.view;
          if (!v) return null;
          const { from, to } = v.state.selection.main;
          if (from === to) return null;
          return v.state.sliceDoc(from, to);
        },
        getPath: () => path,
        reload: () => reloadRef.current(),
        gotoLine: (line: number) => {
          pendingLineRef.current = line;
          applyPendingGoto();
        },
        undo: () => {
          const v = cmRef.current?.view;
          if (v) undo(v);
        },
        redo: () => {
          const v = cmRef.current?.view;
          if (v) redo(v);
        },
        getContent: () => cmRef.current?.view?.state.doc.toString() ?? null,
        insertAtEnd: (text: string) => {
          const v = cmRef.current?.view;
          if (!v) return;
          v.dispatch({
            changes: { from: v.state.doc.length, insert: text },
          });
        },
      }),
      [path, applyPendingGoto],
    );

    if (doc.status === "loading") {
      return (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      );
    }
    if (doc.status === "error") {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-xs text-destructive">
          {doc.message}
        </div>
      );
    }
    if (doc.status === "binary" || doc.status === "toolarge") {
      const ext = path.split(".").pop()?.toLowerCase() ?? "";
      const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(ext);
      const isVideo = ["mp4", "webm", "ogg", "mov"].includes(ext);
      const isAudio = ["mp3", "wav", "flac", "aac", "m4a"].includes(ext);
      const isPdf = ext === "pdf";

      if (isImage || isVideo || isAudio || isPdf) {
        const assetUrl = convertFileSrc(path);
        return (
          <div className="flex h-full min-h-0 flex-col items-center justify-center bg-background p-4 overflow-auto">
            {isImage && (
              <img
                src={assetUrl}
                loading="lazy"
                decoding="async"
                className="max-w-full max-h-full object-contain rounded-md border border-border shadow-sm"
                style={{
                  backgroundImage: 'conic-gradient(#e5e7eb 0.25turn, #f3f4f6 0.25turn 0.5turn, #e5e7eb 0.5turn 0.75turn, #f3f4f6 0.75turn)',
                  backgroundSize: '20px 20px',
                }}
                alt={pathBasename(path)}
              />
            )}
            {isVideo && (
              // biome-ignore lint/a11y/useMediaCaption: local media preview opens arbitrary files with no caption track
              <video
                controls
                preload="metadata"
                className="max-w-full max-h-full"
                src={assetUrl}
              />
            )}
            {isAudio && (
              // biome-ignore lint/a11y/useMediaCaption: local media preview opens arbitrary files with no caption track
              <audio
                controls
                preload="metadata"
                className="w-full max-w-md"
                src={assetUrl}
              />
            )}
            {isPdf && (
              <iframe
                src={assetUrl}
                className="w-full h-full border-none"
                title={pathBasename(path)}
              />
            )}
          </div>
        );
      }

      return (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
          <div className="text-sm text-foreground">
            {doc.status === "binary" ? "Binary file" : "File too large"}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatBytes(doc.size)} · preview not supported
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col zoom-exempt">
        <CodeMirror
          ref={cmRef}
          value={doc.content}
          onChange={onChange}
          theme={themeExt}
          extensions={extensions}
          height="100%"
          className="flex-1 min-h-0 overflow-hidden"
          basicSetup={{
            lineNumbers: false,
            highlightActiveLineGutter: false,
            foldGutter: false,
            bracketMatching: false,
            closeBrackets: false,
            autocompletion: false,
            highlightActiveLine: false,
            highlightSelectionMatches: true,
            searchKeymap: true,
          }}
        />
      </div>
    );
  },
);
