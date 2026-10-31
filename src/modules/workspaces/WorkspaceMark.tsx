import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { resolveWorkspaceColor } from "@/modules/workspaces/lib/workspaceColor";
import { getWorkspaceIcon } from "@/modules/workspaces/lib/workspaceIcon";
import { useIconCatalogVersion } from "@/modules/workspaces/lib/useIconCatalog";

type Props = {
  id: string;
  color?: string | null;
  icon?: string;
  size?: number;
  className?: string;
};

// The workspace identity outside the WorkspaceBar: its icon painted in its color, a solid dot in its color
// when it has none (also while a named icon is not loaded yet), and nothing at all for a workspace with neither.
export function WorkspaceMark({ id, color, icon, size = 14, className }: Props) {
  useIconCatalogVersion();
  const resolved = resolveWorkspaceColor(color, id);
  const glyph = icon ? getWorkspaceIcon(icon) : null;
  if (!glyph && resolved === null) return null;
  const dot = Math.max(4, Math.round(size * 0.55));
  return (
    <span className={cn("flex shrink-0 items-center gap-1", className)}>
      {glyph ? (
        <HugeiconsIcon
          icon={glyph}
          size={size}
          strokeWidth={1.5}
          className="shrink-0"
          style={resolved !== null ? { color: resolved } : undefined}
        />
      ) : (
        <span
          className="shrink-0 rounded-full"
          style={{ width: dot, height: dot, margin: (size - dot) / 2, backgroundColor: resolved ?? undefined }}
        />
      )}
    </span>
  );
}
