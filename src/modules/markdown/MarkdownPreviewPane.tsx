import type React from "react";
import { Streamdown } from "streamdown";

type Props = {
  content: string;
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

const components = { code: MarkdownCode, p: MarkdownParagraph };

export function MarkdownPreviewPane({ content }: Props) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background">
      <div className="thin-scrollbar min-h-0 flex-1 overflow-auto px-6 py-4">
        <Streamdown
          className="select-text prose-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          components={components}
          linkSafety={{ enabled: false }}
        >
          {content}
        </Streamdown>
      </div>
    </div>
  );
}
