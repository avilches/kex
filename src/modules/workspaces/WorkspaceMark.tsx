import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { resolveWorkspaceColor } from "@/modules/workspaces/lib/workspaceColor";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { markGlyph } from "@/modules/workspaces/lib/workspaceIcon";
import { useIconCatalogVersion } from "@/modules/workspaces/lib/useIconCatalog";

type Props = {
  id: string;
  color?: string | null;
  icon?: string;
  size?: number;
  className?: string;
};

// The workspace identity outside the WorkspaceBar: its icon painted in its
// color, or the default icon of Settings > Workspaces (a color dot when that is none).
export function WorkspaceMark({ id, color, icon, size = 14, className }: Props) {
  useIconCatalogVersion();
  const resolved = resolveWorkspaceColor(color, id);
  const defaultIcon = usePreferencesStore((s) => s.defaultWorkspaceIcon);
  const glyph = markGlyph(icon, defaultIcon);
  const dot = Math.max(8, Math.round(size / 2));
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
          aria-hidden
          className={cn("shrink-0 rounded-full", resolved === null && "border border-border")}
          style={{ width: dot, height: dot, ...(resolved !== null ? { backgroundColor: resolved } : {}) }}
        />
      )}
    </span>
  );
}
