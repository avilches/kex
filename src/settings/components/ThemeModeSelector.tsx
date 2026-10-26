import { cn } from "@/lib/utils";
import type { ThemePref } from "@/modules/settings/store";
import { useTheme } from "@/modules/theme";
import { ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const MODES: { id: ThemePref; label: string; icon: typeof ComputerIcon }[] = [
  { id: "system", label: "System", icon: ComputerIcon },
  { id: "light", label: "Light", icon: Sun03Icon },
  { id: "dark", label: "Dark", icon: Moon02Icon },
];

export function ThemeModeSelector() {
  const { mode, setMode } = useTheme();
  return (
    <div className="flex items-center gap-1">
      {MODES.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setMode(o.id)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] transition-all",
            mode === o.id
              ? "border-foreground/60 bg-card ring-1 ring-foreground/20"
              : "border-border/60 bg-transparent hover:border-border",
          )}
        >
          <HugeiconsIcon icon={o.icon} size={12} strokeWidth={1.75} />
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
