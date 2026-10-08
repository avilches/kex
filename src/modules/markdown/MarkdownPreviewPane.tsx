import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useEditorThemeExt } from "@/modules/editor/lib/useEditorThemeExt";
import { buildStaticPreviewExtensions } from "@/modules/markdown/codemirror/lib/markdownExtensions";
import { frontmatterAsCodeBlock } from "@/modules/markdown/lib/frontmatter";
import { resolveMarkdownImageSrc } from "@/modules/markdown/lib/imageSrc";

type Props = {
  content: string;
  // The markdown file's own path: a relative image src resolves against its
  // directory, same as the Live Preview editor does.
  // Optional for markdown that is not a file (a tab note): relative images
  // then have no directory to resolve against.
  path?: string;
  // Sizes to the content up to a max height instead of filling the parent.
  compact?: boolean;
};

export function MarkdownPreviewPane({ content, path = "", compact = false }: Props) {
  const themeExt = useEditorThemeExt();
  const pathRef = useRef(path);
  pathRef.current = path;
  const resolveImageSrc = useCallback((src: string) => resolveMarkdownImageSrc(src, pathRef.current), []);
  const extensions = useMemo(() => buildStaticPreviewExtensions(resolveImageSrc), [resolveImageSrc]);
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
}
