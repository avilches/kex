import { SleepingIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import type { AgentEntryVisual } from "@/modules/agents/lib/notificationList";
import { TabIndicatorMark } from "./TabIndicatorMark";

// The sleeping icon of a tab with its dot or spinner laid over the middle of it, as the tab strip draws them.
export function SleepingBadge({
  size,
  indicator,
  dotPx,
  className,
}: {
  size: number;
  indicator: AgentEntryVisual | null;
  dotPx?: number;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)}>
      <span role="img" aria-label="Tab is hibernated" className="inline-flex">
        <HugeiconsIcon icon={SleepingIcon} size={size} strokeWidth={1.75} />
      </span>
      {indicator && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <TabIndicatorMark indicator={indicator} size={Math.round(size * 0.75)} dotPx={dotPx} />
        </span>
      )}
    </span>
  );
}
