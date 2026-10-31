import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { AgentEntryVisual } from "@/modules/agents/lib/notificationList";

// The spinner of a working agent, or the orange (attention) or red (error) dot, in the line of a tab's name.
// The dot never dims: its color is the same whatever the tab around it is doing.
export function TabIndicatorMark({
  indicator,
  size = 11,
  dotPx = 6,
}: {
  indicator: AgentEntryVisual | null;
  size?: number;
  dotPx?: number;
}) {
  if (indicator === "working") return <Spinner size={size} className="shrink-0" />;
  if (!indicator) return null;
  return (
    <span
      role="img"
      aria-label="Agent needs attention"
      data-indicator-dot=""
      style={{ width: dotPx, height: dotPx }}
      className={cn("shrink-0 rounded-full", indicator === "error" ? "bg-destructive" : "bg-amber-400")}
    />
  );
}
