import { lazy, Suspense } from "react";
import type { TabEntry } from "./lib/tabEntries";

const MarkdownPreviewPane = lazy(() =>
  import("@/modules/markdown/MarkdownPreviewPane").then((m) => ({ default: m.MarkdownPreviewPane })),
);

// Only a note needs the extra width: directory and branch live in the row itself.
export function hasPreview(entry: TabEntry): boolean {
  return entry.note !== null;
}

// Read-only and non-interactive: the palette input keeps the focus while this follows the selection.
export function TabPreview({ entry }: { entry: TabEntry }) {
  return (
    <aside
      aria-label="Tab note"
      className="pointer-events-none flex w-[280px] shrink-0 flex-col overflow-hidden border-l border-border p-3"
    >
      <div className="min-h-0 flex-1 overflow-hidden text-[var(--editor-foreground)]">
        <Suspense fallback={<pre className="whitespace-pre-wrap text-[12px]">{entry.note}</pre>}>
          <MarkdownPreviewPane content={entry.note ?? ""} path="" />
        </Suspense>
      </div>
    </aside>
  );
}
