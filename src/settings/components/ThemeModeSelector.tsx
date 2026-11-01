import { cn } from "@/lib/utils";
import type { ThemePref } from "@/modules/settings/store";
import { useTheme } from "@/modules/theme";
import { ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

const MODES: { id: ThemePref; label: string; icon: typeof ComputerIcon }[] = [
  { id: "system", label: "System", icon: ComputerIcon },
  { id: "light", label: "Light", icon: Sun03Icon },
  { id: "dark", label: "Dark", icon: Moon02Icon },
];

// The same Radix radio group SegmentedControl uses, so the chosen mode is announced and the arrow
// keys move between the three.
export function ThemeModeSelector() {
  const { mode, setMode } = useTheme();
  return (
    <RadioGroupPrimitive.Root
      aria-label="Theme mode"
      value={mode}
      onValueChange={(v) => setMode(v as ThemePref)}
      orientation="horizontal"
      className="flex items-center gap-1"
    >
      {MODES.map((o) => (
        <RadioGroupPrimitive.Item
          key={o.id}
          value={o.id}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring/50",
            mode === o.id
              ? "border-foreground/60 bg-card ring-1 ring-foreground/20"
              : "border-border/60 bg-transparent hover:border-border",
          )}
        >
          <HugeiconsIcon icon={o.icon} size={12} strokeWidth={1.75} />
          <span>{o.label}</span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
