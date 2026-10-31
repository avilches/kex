import type { CSSProperties } from "react";
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

// The workspace identity outside the WorkspaceBar: its icon painted in its color, a small solid square in its color
// when it has none (also while a named icon is not loaded yet), and nothing at all for a workspace with neither.
export const WORKSPACE_SQUARE_SIDE = 8;

export function WorkspaceSquare({
  color,
  className,
  style,
}: {
  color: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cn("shrink-0 rounded-[2px]", className)}
      style={{
        width: WORKSPACE_SQUARE_SIDE,
        height: WORKSPACE_SQUARE_SIDE,
        backgroundColor: color ?? undefined,
        ...style,
      }}
    />
  );
}

export function WorkspaceMark({ id, color, icon, size = 14, className }: Props) {
  useIconCatalogVersion();
  const resolved = resolveWorkspaceColor(color, id);
  const glyph = icon ? getWorkspaceIcon(icon) : null;
  if (!glyph && resolved === null) return null;
  const side = WORKSPACE_SQUARE_SIDE;
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
        <WorkspaceSquare color={resolved} style={{ margin: Math.max(0, (size - side) / 2) }} />
      )}
    </span>
  );
}
