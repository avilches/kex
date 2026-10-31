import { SleepingIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import type { AgentEntryVisual } from "@/modules/agents/lib/notificationList";
import { TabIndicatorMark } from "./TabIndicatorMark";

// The sleeping icon of a tab, always dimmed, with its dot or spinner laid over the middle of it as the tab strip
// draws them. The box has the icon's own size so the dot sits on its center, and the icon carries its size inline
// because the palette and the menus force a size on every svg that has no size class.
export function SleepingBadge({
  size,
  indicator,
  dotPx = Math.round(size / 2),
  className,
}: {
  size: number;
  indicator: AgentEntryVisual | null;
  dotPx?: number;
  className?: string;
}) {
  return (
    <span
      style={{ width: size, height: size }}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
    >
      <span role="img" aria-label="Tab is hibernated" className="inline-flex opacity-40">
        <HugeiconsIcon icon={SleepingIcon} size={size} strokeWidth={1.75} style={{ width: size, height: size }} />
      </span>
      {indicator && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <TabIndicatorMark indicator={indicator} size={Math.round(size * 0.75)} dotPx={dotPx} />
        </span>
      )}
    </span>
  );
}
