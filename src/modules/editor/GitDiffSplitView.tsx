import { MergeView } from "@codemirror/merge";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, lineNumbers as lineNumbersExtView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { DIFF_THEME } from "./GitDiffPane";

type Props = {
  originalContent: string;
  modifiedContent: string;
  languageExt: Extension;
  wrap: boolean;
  lineNumbers: boolean;
  themeExt: Extension;
};

const SPLIT_THEME = EditorView.theme({
  "&": { height: "100%" },
  ".cm-scroller": { overflow: "auto" },
});

export function GitDiffSplitView({
  originalContent,
  modifiedContent,
  languageExt,
  wrap,
  lineNumbers,
  themeExt,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;
    const shared: Extension[] = [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      themeExt,
      DIFF_THEME,
      SPLIT_THEME,
      languageExt,
      lineNumbers ? lineNumbersExtView() : [],
      wrap ? EditorView.lineWrapping : [],
    ];
    const view = new MergeView({
      parent,
      orientation: "a-b",
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 6 },
      a: { doc: originalContent, extensions: shared },
      b: { doc: modifiedContent, extensions: shared },
    });
    return () => view.destroy();
  }, [originalContent, modifiedContent, languageExt, wrap, lineNumbers, themeExt]);

  return (
    <div
      ref={hostRef}
      className="h-full w-full overflow-hidden [&_.cm-mergeView]:h-full [&_.cm-mergeViewEditors]:h-full [&_.cm-mergeViewEditor]:h-full"
    />
  );
}
