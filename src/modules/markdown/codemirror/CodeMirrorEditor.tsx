import { useEditorThemeExt } from "@/modules/editor/lib/useEditorThemeExt";
import { buildLivePreviewExtensions } from "@/modules/markdown/codemirror/lib/markdownExtensions";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

export type CodeMirrorEditorHandle = { focus(): void };

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, Props>(
  function CodeMirrorEditor({ value, onChange }, ref) {
    const cmRef = useRef<ReactCodeMirrorRef>(null);
    const themeExt = useEditorThemeExt();
    // Stable identity: buildLivePreviewExtensions() takes no arguments, so this
    // only needs to run once, not on every theme change (the theme is a
    // separate prop below, per Task 7's note on @uiw/react-codemirror's
    // `theme` default).
    const extensions = useMemo(() => buildLivePreviewExtensions(), []);

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
