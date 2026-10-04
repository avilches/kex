import { useEditorThemeExt } from "@/modules/editor/lib/useEditorThemeExt";
import {
  buildLiveDecorationExtensions,
  buildMarkdownBaseExtensions,
} from "@/modules/markdown/codemirror/lib/markdownExtensions";
import { resolveMarkdownImageSrc } from "@/modules/markdown/lib/imageSrc";
import { Compartment } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";

export type CodeMirrorEditorHandle = {
  focus(): void;
  // 0-based line; puts the cursor at its start and scrolls it to the top.
  scrollToLine(line: number): void;
};

// "source" shows the raw markdown; "rich" adds the Live Preview decorations.
// Both share the same view, so cursor, scroll and undo history survive a switch.
export type CodeMirrorEditorMode = "source" | "rich";

type Props = {
  value: string;
  onChange: (next: string) => void;
  // Any value whose identity changes exactly when the content is reloaded from
  // its source; a change forces the view to show `value` even when that string
  // equals what @uiw/react-codemirror last compared against.
  syncKey: unknown;
  // The markdown file's own path, so a relative image src resolves against
  // its directory, same as RichMarkdownEditor.resolveImageSrc.
  path: string;
  mode?: CodeMirrorEditorMode;
};

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, Props>(
  function CodeMirrorEditor({ value, onChange, syncKey, path, mode = "rich" }, ref) {
    const cmRef = useRef<ReactCodeMirrorRef>(null);
    const themeExt = useEditorThemeExt();
    const pathRef = useRef(path);
    pathRef.current = path;
    const resolveImageSrc = useCallback(
      (src: string): string => resolveMarkdownImageSrc(src, pathRef.current),
      [],
    );
    const liveExtensions = useMemo(() => buildLiveDecorationExtensions(resolveImageSrc), [resolveImageSrc]);
    const liveCompartment = useMemo(() => new Compartment(), []);
    const modeRef = useRef(mode);
    modeRef.current = mode;
    // Stable identity: @uiw/react-codemirror reconfigures the whole view when
    // this array changes, which would drop the compartment's current content.
    // The initial mode is read through a ref and later switches go through
    // the effect below.
    const extensions = useMemo(
      () => [
        ...buildMarkdownBaseExtensions(),
        liveCompartment.of(modeRef.current === "rich" ? liveExtensions : []),
      ],
      [liveCompartment, liveExtensions],
    );

    const appliedModeRef = useRef(mode);
    useEffect(() => {
      if (appliedModeRef.current === mode) return;
      appliedModeRef.current = mode;
      cmRef.current?.view?.dispatch({
        effects: liveCompartment.reconfigure(mode === "rich" ? liveExtensions : []),
      });
    }, [mode, liveCompartment, liveExtensions]);

    // @uiw/react-codemirror only pushes `value` into the view when it differs,
    // by string equality, from what it last compared. After the user types and
    // then reloads a disk content equal to that last value, the discarded edit
    // would otherwise stay on screen.
    const lastSyncedKeyRef = useRef<unknown>(syncKey);
    const firstRenderRef = useRef(true);
    useEffect(() => {
      if (firstRenderRef.current) {
        firstRenderRef.current = false;
        return;
      }
      if (syncKey === lastSyncedKeyRef.current) return;
      lastSyncedKeyRef.current = syncKey;
      const view = cmRef.current?.view;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current === value) return;
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }, [syncKey, value]);

    useImperativeHandle(ref, () => ({
      focus: () => cmRef.current?.view?.focus(),
      scrollToLine: (line) => {
        const view = cmRef.current?.view;
        if (!view) return;
        const target = view.state.doc.line(Math.min(Math.max(line + 1, 1), view.state.doc.lines));
        view.dispatch({
          selection: { anchor: target.from },
          effects: EditorView.scrollIntoView(target.from, { y: "start" }),
        });
        view.focus();
      },
    }));

    return (
      <CodeMirror
        ref={cmRef}
        value={value}
        // @uiw/react-codemirror calls this with (value, ViewUpdate); forward
        // only the string so onChange matches its declared Props signature.
        onChange={(next) => onChange(next)}
        theme={themeExt}
        height="100%"
        className="h-full w-full overflow-auto"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLineGutter: false,
          highlightActiveLine: false,
          bracketMatching: false,
          closeBrackets: false,
          autocompletion: false,
        }}
        extensions={extensions}
      />
    );
  },
);
