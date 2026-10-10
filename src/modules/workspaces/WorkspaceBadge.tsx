import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import {
  chipColorOnWhite,
  resolveWorkspaceColor,
} from "@/modules/workspaces/lib/workspaceColor";
import { getWorkspaceIcon } from "@/modules/workspaces/lib/workspaceIcon";

type Props = {
  id: string;
  color?: string | null;
  icon?: string;
  className?: string;
};

export function WorkspaceBadge({ id, color, icon, className }: Props) {
  const resolved = resolveWorkspaceColor(color, id);
  const glyph = icon ? getWorkspaceIcon(icon) : undefined;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        glyph ? "size-5" : "size-3",
        resolved === null && "text-foreground",
        className,
      )}
      style={
        resolved !== null
          ? { backgroundColor: chipColorOnWhite(resolved), color: "#ffffff" }
          : { backgroundColor: "var(--muted)", boxShadow: "inset 0 0 0 1px var(--ring)" }
      }
    >
      {glyph && <HugeiconsIcon icon={glyph} size={12} strokeWidth={1.5} />}
    </span>
  );
}
