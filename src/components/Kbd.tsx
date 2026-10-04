import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// Keycap styling shared by the block watermark hints and the scratchpad bar.
export function Kbd({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md border border-border/60 bg-muted/50 px-1.5 font-sans text-[11px] font-medium text-foreground/80 shadow-xs",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
