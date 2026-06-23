import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { EditorViewSettings } from "./lib/editorViewSettings";

type MarkdownViewMode = "rendered" | "raw";

type Props = {
  view?: {
    mode: MarkdownViewMode;
    onChange: (mode: MarkdownViewMode) => void;
    renderedDisabled?: boolean;
    renderedHint?: string;
  };
  viewToggles?: {
    ext: string;
    value: EditorViewSettings;
    onChange: (next: EditorViewSettings) => void;
  };
};

export function EditorOverlayBar({ view, viewToggles }: Props) {
  const showToggles = view?.mode !== "rendered" && !!viewToggles;
  const v = viewToggles?.value;
  const set = (patch: Partial<EditorViewSettings>) => {
    if (!viewToggles || !v) return;
    viewToggles.onChange({ ...v, ...patch });
  };
  const extLabel = viewToggles?.ext ? `.${viewToggles.ext}` : "this file type";
  return (
    <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md border border-border/60 bg-card/85 p-0.5 text-[11px] shadow-sm backdrop-blur">
      {showToggles && v && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="View options"
              className="flex size-[22px] items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} size={12} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-[12px]">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">
              Applies to {extLabel} files
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={v.wrap}
              onCheckedChange={(c) => set({ wrap: !!c })}
            >
              Word wrap
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={v.lineNumbers}
              onCheckedChange={(c) => set({ lineNumbers: !!c })}
            >
              Line numbers
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={v.whitespace}
              onCheckedChange={(c) => set({ whitespace: !!c })}
            >
              Show whitespace
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={v.foldGutter}
              onCheckedChange={(c) => set({ foldGutter: !!c })}
            >
              Fold gutter
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {view && showToggles && v && <div className="h-4 w-px bg-border/60" />}
      {view && (
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => view.onChange("raw")}
            className={cn(
              "rounded px-2 py-0.5 transition-colors",
              view.mode === "raw"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => view.onChange("rendered")}
            disabled={view.renderedDisabled}
            title={view.renderedDisabled ? view.renderedHint : undefined}
            className={cn(
              "rounded px-2 py-0.5 transition-colors",
              view.mode === "rendered"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
              view.renderedDisabled &&
                "cursor-not-allowed opacity-40 hover:text-muted-foreground",
            )}
          >
            Rendered
          </button>
        </div>
      )}
    </div>
  );
}
