import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { useEditorThemeExt } from "@/modules/editor/lib/useEditorThemeExt";
import { buildStaticPreviewExtensions } from "@/modules/markdown/codemirror/lib/markdownExtensions";
import { frontmatterAsCodeBlock } from "@/modules/markdown/lib/frontmatter";
import { scrollToTopLine, topLineOf } from "@/modules/markdown/codemirror/lib/viewPosition";
import { previewToSourceLine, sourceToPreviewLine } from "@/modules/markdown/lib/viewPosition";
import { resolveMarkdownImageSrc } from "@/modules/markdown/lib/imageSrc";

type Props = {
  content: string;
  // The markdown file's own path: a relative image src resolves against its
  // directory, same as the Live Preview editor does.
  path: string;
  // Source line to show at the top when the pane mounts.
  initialTopLine?: number | null;
};

export type MarkdownPreviewPaneHandle = {
  // Source line (not Preview line) at the top of the viewport.
  getTopLine(): number | null;
};

export const MarkdownPreviewPane = forwardRef<MarkdownPreviewPaneHandle, Props>(function MarkdownPreviewPane(
  { content, path, initialTopLine },
  ref,
) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const initialTopLineRef = useRef(initialTopLine);
  useEffect(() => {
    const view = cmRef.current?.view;
    const line = initialTopLineRef.current;
    if (view && line) scrollToTopLine(view, sourceToPreviewLine(contentRef.current, line));
  }, []);
  useImperativeHandle(ref, () => ({
    getTopLine: () => {
      const view = cmRef.current?.view;
      return view ? previewToSourceLine(contentRef.current, topLineOf(view)) : null;
    },
  }));
  const themeExt = useEditorThemeExt();
  const pathRef = useRef(path);
  pathRef.current = path;
  const resolveImageSrc = useCallback((src: string) => resolveMarkdownImageSrc(src, pathRef.current), []);
  const extensions = useMemo(() => buildStaticPreviewExtensions(resolveImageSrc), [resolveImageSrc]);
  const value = useMemo(() => frontmatterAsCodeBlock(content), [content]);
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[var(--editor-background)] text-[var(--editor-foreground)]">
      <CodeMirror
        ref={cmRef}
        value={value}
        theme={themeExt}
        editable={false}
        height="100%"
        className="min-h-0 flex-1 overflow-auto"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLineGutter: false,
          highlightActiveLine: false,
          bracketMatching: false,
          closeBrackets: false,
          autocompletion: false,
          drawSelection: false,
        }}
        extensions={extensions}
      />
    </div>
  );
});
