import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { resolveWorkspaceColor } from "@/modules/workspaces/lib/workspaceColor";
import { markGlyph } from "@/modules/workspaces/lib/workspaceIcon";
import { useIconCatalogVersion } from "@/modules/workspaces/lib/useIconCatalog";

type Props = {
  id: string;
  color?: string | null;
  icon?: string;
  size?: number;
  className?: string;
};

// The workspace identity outside the WorkspaceBar: its icon painted in its color, a circle in its color
// when it has none, and nothing at all for a workspace with neither.
export function WorkspaceMark({ id, color, icon, size = 14, className }: Props) {
  useIconCatalogVersion();
  const resolved = resolveWorkspaceColor(color, id);
  const glyph = markGlyph(icon, resolved !== null);
  if (!glyph) return null;
  return (
    <span className={cn("flex shrink-0 items-center gap-1", className)}>
      <HugeiconsIcon
        icon={glyph}
        size={size}
        strokeWidth={1.5}
        className="shrink-0"
        style={resolved !== null ? { color: resolved } : undefined}
      />
    </span>
  );
}
