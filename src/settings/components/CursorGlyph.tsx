import { cn } from "@/lib/utils";
import type { CursorInactiveStyle, CursorStyle } from "@/modules/settings/store";

// A tiny cell that mimics how the cursor looks for each xterm style.
export function CursorGlyph({ kind }: { kind: CursorStyle | CursorInactiveStyle }) {
  if (kind === "none") {
    return (
      <span className="ml-auto text-[10px] text-muted-foreground/70">off</span>
    );
  }
  const shape: Record<Exclude<CursorInactiveStyle, "none">, string> = {
    bar: "border-l-2 border-current",
    block: "bg-current",
    underline: "border-b-2 border-current",
    outline: "border border-current",
  };
  return (
    <span
      aria-hidden
      className={cn(
        "ml-auto inline-block h-3.5 w-2.5 text-foreground/70",
        shape[kind],
      )}
    />
  );
}
