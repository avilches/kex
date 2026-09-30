import type React from "react";
import { useMemo } from "react";
import { Streamdown } from "streamdown";
import { markLocalImages, resolveLocalImage } from "@/modules/markdown/lib/imageSrc";

type Props = {
  content: string;
  // The markdown file's own path: a relative image src resolves against its
  // directory, same as the Live Preview editor does.
  path: string;
};

function MarkdownCode({ children }: { children?: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
      {children}
    </code>
  );
}

// Streamdown's image component renders a <div> wrapper for the hover overlay,
// which is invalid HTML inside <p>. Use div to allow block children.
function MarkdownParagraph({ children }: { children?: React.ReactNode }) {
  return <div className="my-[0.5714286em]">{children}</div>;
}

export function MarkdownPreviewPane({ content, path }: Props) {
  const marked = useMemo(() => markLocalImages(content), [content]);
  const components = useMemo(
    () => ({
      code: MarkdownCode,
      p: MarkdownParagraph,
      img: ({ src, alt }: { src?: string; alt?: string }) => (
        <img
          src={src ? resolveLocalImage(src, path) : undefined}
          alt={alt}
          loading="lazy"
          className="max-w-full rounded"
        />
      ),
    }),
    [path],
  );
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-[var(--editor-background)] text-[var(--editor-foreground)]">
      <div className="thin-scrollbar min-h-0 flex-1 overflow-auto px-6 py-4">
        <Streamdown
          className="select-text prose-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          components={components}
          linkSafety={{ enabled: false }}
        >
          {marked}
        </Streamdown>
      </div>
    </div>
  );
}
