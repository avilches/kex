import type { JSX } from "react";
import { formatBytes } from "@/lib/formatBytes";

export type MarkdownDocFallbackState =
  | { status: "binary"; size: number }
  | { status: "toolarge"; size: number; limit: number }
  | { status: "error"; message: string };

export function MarkdownDocFallback({ doc }: { doc: MarkdownDocFallbackState }): JSX.Element | null {
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
