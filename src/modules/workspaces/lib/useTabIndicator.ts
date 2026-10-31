import { useMemo } from "react";
import { buildAgentEntries, type AgentEntryVisual } from "@/modules/agents/lib/notificationList";
import { useAgentStore } from "@/modules/agents/store/agentStore";

// The dot or spinner of a tab read live, so a surface follows its agent while it is open; `fallback` only
// covers a tab with no live session, such as one that sleeps or has just woken.
export function useTabIndicator(tabId: string, fallback: AgentEntryVisual | null): AgentEntryVisual | null {
  const session = useAgentStore((s) => s.sessions[tabId]);
  const notifications = useAgentStore((s) => s.notifications);
  const live = useMemo(
    () =>
      session || notifications.some((n) => n.tabId === tabId)
        ? (buildAgentEntries(
            session ? { [tabId]: session } : {},
            notifications.filter((n) => n.tabId === tabId),
          )[0]?.visual ?? null)
        : null,
    [session, notifications, tabId],
  );
  return live ?? fallback;
}
