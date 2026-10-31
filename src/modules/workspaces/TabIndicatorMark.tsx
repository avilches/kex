import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { AgentEntryVisual } from "@/modules/agents/lib/notificationList";

// The spinner of a working agent, or the orange (attention) or red (error) dot, in the line of a tab's name.
export function TabIndicatorMark({ indicator, size = 11 }: { indicator: AgentEntryVisual | null; size?: number }) {
  if (indicator === "working") return <Spinner size={size} className="shrink-0" />;
  if (!indicator) return null;
  return (
    <span
      aria-hidden
      data-indicator-dot=""
      className={cn("size-[6px] shrink-0 rounded-full", indicator === "error" ? "bg-destructive" : "bg-amber-400")}
    />
  );
}
