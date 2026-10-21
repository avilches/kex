import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { CM_MARKDOWN_PREVIEW_SETUP } from "@/lib/codemirrorSetup";
import { viewSearchHandle, type ViewSearchHandle } from "@/lib/cmSearch";
import { useEditorThemeExt } from "@/modules/editor/lib/useEditorThemeExt";
import type { WikiLinkHost } from "@/modules/markdown/codemirror/lib/livePreviewPlugin";
import { buildStaticPreviewExtensions } from "@/modules/markdown/codemirror/lib/markdownExtensions";
import { useWikiLinkExtension } from "@/modules/markdown/codemirror/lib/useWikiLinkExtension";
import { scrollToTopLine, topLineOf } from "@/modules/markdown/codemirror/lib/viewPosition";
import { resolveMarkdownImageSrc } from "@/modules/markdown/lib/imageSrc";

type Props = {
  content: string;
  // The markdown file's own path: a relative image src resolves against its
  // directory, same as the Live Preview editor does.
  path: string;
  wikiLinks?: WikiLinkHost;
  // Source line to show at the top when the pane mounts.
  initialTopLine?: number | null;
};

export type MarkdownPreviewPaneHandle = {
  search: ViewSearchHandle;
  // 1-based source line at the top of the viewport.
  getTopLine(): number | null;
};

export const MarkdownPreviewPane = forwardRef<MarkdownPreviewPaneHandle, Props>(function MarkdownPreviewPane(
  { content, path, wikiLinks, initialTopLine },
  ref,
) {
  const themeExt = useEditorThemeExt();
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const wikiExtension = useWikiLinkExtension(cmRef, wikiLinks);
  const initialTopLineRef = useRef(initialTopLine);
  useEffect(() => {
    const view = cmRef.current?.view;
    const line = initialTopLineRef.current;
    if (view && line) scrollToTopLine(view, line);
  }, []);
  useImperativeHandle(ref, () => ({
    search: viewSearchHandle(() => cmRef.current?.view),
    getTopLine: () => {
      const view = cmRef.current?.view;
      return view ? topLineOf(view) : null;
    },
  }));
  const pathRef = useRef(path);
  pathRef.current = path;
  const resolveImageSrc = useCallback((src: string) => resolveMarkdownImageSrc(src, pathRef.current), []);
  const extensions = useMemo(
    () => [...buildStaticPreviewExtensions(resolveImageSrc), wikiExtension],
    [resolveImageSrc, wikiExtension],
  );
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[var(--editor-background)] text-[var(--editor-foreground)]">
      <CodeMirror
        ref={cmRef}
        value={content}
        theme={themeExt}
        editable={false}
        height="100%"
        className="min-h-0 flex-1 overflow-auto"
        basicSetup={CM_MARKDOWN_PREVIEW_SETUP}
        extensions={extensions}
      />
    </div>
  );
});
