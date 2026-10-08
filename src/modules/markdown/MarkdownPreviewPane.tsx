import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import type { WikiLinkHost } from "@/modules/markdown/codemirror/lib/livePreviewPlugin";
import { useWikiLinkExtension } from "@/modules/markdown/codemirror/lib/useWikiLinkExtension";
import { useCallback, useMemo, useRef } from "react";
import { useEditorThemeExt } from "@/modules/editor/lib/useEditorThemeExt";
import { buildStaticPreviewExtensions } from "@/modules/markdown/codemirror/lib/markdownExtensions";
import { frontmatterAsCodeBlock } from "@/modules/markdown/lib/frontmatter";
import { resolveMarkdownImageSrc } from "@/modules/markdown/lib/imageSrc";

type Props = {
  content: string;
  // The markdown file's own path: a relative image src resolves against its
  // directory, same as the Live Preview editor does.
  path: string;
  wikiLinks?: WikiLinkHost;
};

export function MarkdownPreviewPane({ content, path, wikiLinks }: Props) {
  const themeExt = useEditorThemeExt();
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const wikiExtension = useWikiLinkExtension(cmRef, wikiLinks);
  const pathRef = useRef(path);
  pathRef.current = path;
  const resolveImageSrc = useCallback((src: string) => resolveMarkdownImageSrc(src, pathRef.current), []);
  const extensions = useMemo(
    () => [...buildStaticPreviewExtensions(resolveImageSrc), wikiExtension],
    [resolveImageSrc, wikiExtension],
  );
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
}
