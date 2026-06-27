import { cn } from "@/lib/utils";
import { getShortcutLabel, type ShortcutId } from "@/modules/shortcuts";
import { usePreferencesStore } from "@/modules/settings/preferences";
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

// Renders the live binding of a shortcut as one keycap per token. Empty when the
// shortcut has no binding on this platform.
export function ShortcutKeys({
  id,
  className,
}: {
  id: ShortcutId;
  className?: string;
}) {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const label = getShortcutLabel(id, userShortcuts) ?? "";
  // Binding tokens are distinct (each modifier appears once plus the key).
  const tokens = label ? label.split(" ") : [];
  return (
    <>
      {tokens.map((t) => (
        <Kbd key={t} className={className}>
          {t}
        </Kbd>
      ))}
    </>
  );
}
