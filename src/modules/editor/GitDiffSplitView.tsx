import { MergeView } from "@codemirror/merge";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, lineNumbers as lineNumbersExtView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { DIFF_THEME } from "./GitDiffPane";
import { resolveLanguage, resolveLanguageSync } from "./lib/languageResolver";

type Props = {
  path: string;
  originalContent: string;
  modifiedContent: string;
  wrap: boolean;
  lineNumbers: boolean;
  themeExt: Extension;
};

const SPLIT_THEME = EditorView.theme({
  "&": { height: "100%" },
  ".cm-scroller": { overflow: "auto" },
});

export function GitDiffSplitView({
  path,
  originalContent,
  modifiedContent,
  wrap,
  lineNumbers,
  themeExt,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MergeView | null>(null);
  const langCompartment = useRef(new Compartment()).current;

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;
    const initialLang = resolveLanguageSync(path)?.ext ?? [];
    const shared: Extension[] = [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      themeExt,
      DIFF_THEME,
      SPLIT_THEME,
      langCompartment.of(initialLang),
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
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [path, originalContent, modifiedContent, wrap, lineNumbers, themeExt, langCompartment]);

  useEffect(() => {
    if (resolveLanguageSync(path)) return;
    let cancelled = false;
    resolveLanguage(path).then((res) => {
      if (cancelled) return;
      const mv = viewRef.current;
      if (!mv) return;
      const ext = res?.ext ?? [];
      mv.a.dispatch({ effects: langCompartment.reconfigure(ext) });
      mv.b.dispatch({ effects: langCompartment.reconfigure(ext) });
    });
    return () => {
      cancelled = true;
    };
  }, [path, originalContent, modifiedContent, langCompartment]);

  return (
    <div
      ref={hostRef}
      className="h-full w-full overflow-hidden [&_.cm-mergeView]:h-full [&_.cm-mergeViewEditors]:h-full [&_.cm-mergeViewEditor]:h-full"
    />
  );
}
