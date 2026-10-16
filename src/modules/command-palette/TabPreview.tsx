import { lazy, Suspense } from "react";
import type { TabEntry } from "./lib/tabEntries";

const MarkdownPreviewPane = lazy(() =>
  import("@/modules/markdown/MarkdownPreviewPane").then((m) => ({ default: m.MarkdownPreviewPane })),
);

export function hasPreview(entry: TabEntry): boolean {
  return entry.note !== null || !!entry.cwd || !!entry.branch;
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate font-mono text-[11.5px]">{value}</div>
    </div>
  );
}

// Read-only and non-interactive: the palette input keeps the focus while this follows the selection.
export function TabPreview({ entry }: { entry: TabEntry }) {
  return (
    <aside
      aria-label="Tab details"
      className="pointer-events-none flex w-[260px] shrink-0 flex-col gap-3 overflow-hidden border-l border-border p-3"
    >
      {entry.note !== null ? (
        <div className="max-h-[260px] overflow-hidden text-[var(--editor-foreground)]">
          <Suspense fallback={<pre className="whitespace-pre-wrap text-[12px]">{entry.note}</pre>}>
            <MarkdownPreviewPane content={entry.note} path="" />
          </Suspense>
        </div>
      ) : null}
      <Field label="Directory" value={entry.cwd} />
      <Field label="Branch" value={entry.branch} />
      <Field label="Worktree" value={entry.worktree} />
    </aside>
  );
}
