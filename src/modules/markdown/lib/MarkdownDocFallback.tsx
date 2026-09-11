import type { JSX } from "react";
import type { MarkdownDocState } from "@/modules/markdown/lib/useMarkdownDocument";

// Mirrors EditorPane's formatting so the non-editable fallbacks read identically.
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function MarkdownDocFallback({ doc }: { doc: MarkdownDocState }): JSX.Element | null {
  if (doc.status === "error") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-xs text-destructive">
        {doc.message}
      </div>
    );
  }
  if (doc.status === "binary" || doc.status === "toolarge") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <div className="text-sm text-foreground">
          {doc.status === "binary" ? "Binary file" : "File too large"}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatBytes(doc.size)} · preview not supported
        </div>
      </div>
    );
  }
  return null;
}
