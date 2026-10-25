import { cn } from "@/lib/utils";
import { type UsageLevel, usageBadge } from "../lib/usage";
import { useAgentStore } from "../store/agentStore";

const LEVEL_CLASS: Record<UsageLevel, string> = {
  normal: "text-muted-foreground",
  high: "text-amber-500 dark:text-amber-400",
  critical: "text-destructive",
};

/** The status line reading of the agent in this tab; renders nothing until there is one. */
export function AgentUsageBadge({ tabId }: { tabId: string }) {
  const usage = useAgentStore((s) => s.usage[tabId]);
  const badge = usageBadge(usage, Date.now());
  if (!badge) return null;
  return (
    <span
      className={cn(
        "shrink-0 text-[10px] tabular-nums leading-none",
        LEVEL_CLASS[badge.level],
      )}
      title={badge.title}
    >
      {badge.label}
    </span>
  );
}
