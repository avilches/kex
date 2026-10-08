import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useEditorThemeExt } from "@/modules/editor/lib/useEditorThemeExt";
import type { WikiLinkHost } from "@/modules/markdown/codemirror/lib/livePreviewPlugin";
import { buildStaticPreviewExtensions } from "@/modules/markdown/codemirror/lib/markdownExtensions";
import { useWikiLinkExtension } from "@/modules/markdown/codemirror/lib/useWikiLinkExtension";
import { scrollToTopLine, topLineOf } from "@/modules/markdown/codemirror/lib/viewPosition";
import { frontmatterAsCodeBlock } from "@/modules/markdown/lib/frontmatter";
import { resolveMarkdownImageSrc } from "@/modules/markdown/lib/imageSrc";
import { previewToSourceLine, sourceToPreviewLine } from "@/modules/markdown/lib/viewPosition";

type Props = {
  content: string;
  // The markdown file's own path: a relative image src resolves against its
  // directory, same as the Live Preview editor does.
  // Optional for markdown that is not a file (a tab note): relative images
  // then have no directory to resolve against.
  path?: string;
  wikiLinks?: WikiLinkHost;
  // Source line to show at the top when the pane mounts.
  initialTopLine?: number | null;
  // Sizes to the content up to a max height instead of filling the parent.
  compact?: boolean;
};

export type MarkdownPreviewPaneHandle = {
  // Source line (not Preview line) at the top of the viewport.
  getTopLine(): number | null;
};

export const MarkdownPreviewPane = forwardRef<MarkdownPreviewPaneHandle, Props>(function MarkdownPreviewPane(
  { content, path = "", wikiLinks, initialTopLine, compact = false },
  ref,
) {
  const themeExt = useEditorThemeExt();
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const wikiExtension = useWikiLinkExtension(cmRef, wikiLinks);
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
  const pathRef = useRef(path);
  pathRef.current = path;
  const resolveImageSrc = useCallback((src: string) => resolveMarkdownImageSrc(src, pathRef.current), []);
  const extensions = useMemo(
    () => [...buildStaticPreviewExtensions(resolveImageSrc), wikiExtension],
    [resolveImageSrc, wikiExtension],
  );
  const value = useMemo(() => frontmatterAsCodeBlock(content), [content]);
  return (
    <div
      data-compact={compact || undefined}
      className={cn(
        "relative flex w-full flex-col overflow-hidden bg-[var(--editor-background)] text-[var(--editor-foreground)]",
        compact ? "max-h-64" : "h-full",
      )}
    >
      <CodeMirror
        ref={cmRef}
        value={value}
        theme={themeExt}
        editable={false}
        height={compact ? undefined : "100%"}
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
