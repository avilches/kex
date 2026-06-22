import { cn } from "@/lib/utils";
import { WrapToggleButton } from "./WrapToggleButton";

type MarkdownViewMode = "rendered" | "raw";

type Props = {
  view?: {
    mode: MarkdownViewMode;
    onChange: (mode: MarkdownViewMode) => void;
    renderedDisabled?: boolean;
    renderedHint?: string;
  };
};

export function EditorOverlayBar({ view }: Props) {
  return (
    <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md border border-border/60 bg-card/85 p-0.5 text-[11px] shadow-sm backdrop-blur">
      {view && (
        <>
          <div className="inline-flex items-center gap-0.5">
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
          </div>
          <div className="h-4 w-px bg-border/60" />
        </>
      )}
      <WrapToggleButton />
    </div>
  );
}
