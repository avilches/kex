import { useMemo, useSyncExternalStore } from "react";
import { buildAgentEntries, type AgentEntryVisual } from "@/modules/agents/lib/notificationList";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { getRunningCommandsSnapshot, subscribeToRunningCommands } from "./terminalEphemeralStore";

// The dot or spinner of a tab read live, so a surface follows its agent while it is open; `fallback` only
// covers a tab with no live session, such as one that sleeps or has just woken. A terminal running a command
// of its own (no agent session) shows the spinner too, like the palette's Running commands section.
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
  const runningCommand = useSyncExternalStore(subscribeToRunningCommands, () => getRunningCommandsSnapshot().has(tabId));
  if (live) return live;
  return fallback ?? (runningCommand && !session ? "working" : null);
}
