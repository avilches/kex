import { useEditorThemeExt } from "@/modules/editor/lib/useEditorThemeExt";
import { buildLivePreviewExtensions } from "@/modules/markdown/codemirror/lib/markdownExtensions";
import { resolveMarkdownImageSrc } from "@/modules/markdown/lib/imageSrc";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";

export type CodeMirrorEditorHandle = { focus(): void };

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
};

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, Props>(
  function CodeMirrorEditor({ value, onChange, syncKey, path }, ref) {
    const cmRef = useRef<ReactCodeMirrorRef>(null);
    const themeExt = useEditorThemeExt();
    const pathRef = useRef(path);
    pathRef.current = path;
    const resolveImageSrc = useCallback(
      (src: string): string => resolveMarkdownImageSrc(src, pathRef.current),
      [],
    );
    // Stable identity: resolveImageSrc reads pathRef at call time, so this
    // only needs to run once, not on every theme change (the theme is a
    // separate prop below, per Task 7's note on @uiw/react-codemirror's
    // `theme` default) or every time the tab is pointed at a new path.
    const extensions = useMemo(() => buildLivePreviewExtensions(resolveImageSrc), [resolveImageSrc]);

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
