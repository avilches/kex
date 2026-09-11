import { cn } from "@/lib/utils";
import type { JSX } from "react";
import type { OutlineHeading } from "@/modules/markdown/milkdown/outline";

export function OutlinePanel({
  headings,
  onNavigate,
  onClose,
}: {
  headings: OutlineHeading[];
  onNavigate: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="relative flex h-full shrink-0 border-l border-border bg-background">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-2.5">
          <h3 className="text-[12px] font-medium text-foreground">
            Outline
          </h3>
          <button
            type="button"
            title="Close outline"
            onClick={onClose}
            className="flex size-[22px] items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-label="Close"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {headings.length === 0 ? (
          <div className="px-2.5 py-2 text-[12px] text-muted-foreground">
            No headings
          </div>
        ) : (
          <div className="thin-scrollbar flex-1 overflow-auto py-1">
            {headings.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => onNavigate(h.id)}
                className={cn(
                  "block w-full truncate py-1 pr-2.5 text-left text-[12px] text-muted-foreground hover:text-foreground",
                )}
                style={{ paddingLeft: `${10 + (h.level - 1) * 12}px` }}
              >
                {h.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
