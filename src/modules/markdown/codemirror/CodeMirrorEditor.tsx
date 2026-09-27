import { useEditorThemeExt } from "@/modules/editor/lib/useEditorThemeExt";
import { buildLivePreviewExtensions } from "@/modules/markdown/codemirror/lib/markdownExtensions";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";

export type CodeMirrorEditorHandle = { focus(): void };

type Props = {
  value: string;
  onChange: (next: string) => void;
  // Any value whose identity changes exactly when the content is reloaded from
  // its source; a change forces the view to show `value` even when that string
  // equals what @uiw/react-codemirror last compared against.
  syncKey: unknown;
};

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, Props>(
  function CodeMirrorEditor({ value, onChange, syncKey }, ref) {
    const cmRef = useRef<ReactCodeMirrorRef>(null);
    const themeExt = useEditorThemeExt();
    // Stable identity: buildLivePreviewExtensions() takes no arguments, so this
    // only needs to run once, not on every theme change (the theme is a
    // separate prop below, per Task 7's note on @uiw/react-codemirror's
    // `theme` default).
    const extensions = useMemo(() => buildLivePreviewExtensions(), []);

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
