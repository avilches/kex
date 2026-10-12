import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { WORKSPACE_ICON_PALETTE } from "@/modules/workspaces/lib/workspaceIcon";

type Props = {
  value: string | undefined;
  onSelect: (icon: string | null) => void;
};

// The icon palette shared by the workspace and tab context menus.
export function IconPaletteGrid({ value, onSelect }: Props) {
  return (
    <div className="flex flex-wrap gap-0.5">
      <button
        type="button"
        title="No icon"
        onClick={() => onSelect(null)}
        className={cn(
          "flex size-8 items-center justify-center rounded border-2 bg-muted text-muted-foreground transition-colors",
          value == null
            ? "border-foreground"
            : "border-transparent hover:border-muted-foreground/50",
        )}
      >
        <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
      </button>
      {WORKSPACE_ICON_PALETTE.map((entry) => (
        <button
          key={entry.name}
          type="button"
          title={entry.label}
          onClick={() => onSelect(entry.name)}
          className={cn(
            "flex size-8 items-center justify-center rounded border-2 text-foreground transition-colors",
            value === entry.name
              ? "border-foreground bg-muted"
              : "border-transparent hover:border-muted-foreground/40 hover:bg-muted/60",
          )}
        >
          <HugeiconsIcon icon={entry.icon} size={17} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}
