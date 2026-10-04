import CodeMirror from "@uiw/react-codemirror";
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
};

export function MarkdownPreviewPane({ content, path }: Props) {
  const themeExt = useEditorThemeExt();
  const pathRef = useRef(path);
  pathRef.current = path;
  const resolveImageSrc = useCallback((src: string) => resolveMarkdownImageSrc(src, pathRef.current), []);
  const extensions = useMemo(() => buildStaticPreviewExtensions(resolveImageSrc), [resolveImageSrc]);
  const value = useMemo(() => frontmatterAsCodeBlock(content), [content]);
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-[var(--editor-background)] text-[var(--editor-foreground)]">
      <CodeMirror
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
