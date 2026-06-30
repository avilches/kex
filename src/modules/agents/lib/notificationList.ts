import type { AgentNotification, AgentSession } from "./types";

export type AgentEntryVisual = "attention" | "working" | "error";

export type AgentEntry = {
  tabId: string;
  workspaceId: string;
  agent: string;
  visual: AgentEntryVisual;
  at: number;
  /** Drives the bell badge: a pending attention or an unread terminal event. */
  pending: boolean;
};

const RANK: Record<AgentEntryVisual, number> = {
  attention: 0,
  working: 1,
  error: 2,
};

/**
 * Collapse live sessions and the notification log into a single entry per agent
 * (keyed by tabId), showing only what is actionable: agents that need
 * attention (attention/error) or are still working. An idle agent has already been
 * seen, so it is dropped. The orange dot is derived from the live session, so a
 * bell row stays in sync with its tab. Order: attention, then working, then error;
 * newest first within each group.
 */
export function buildAgentEntries(
  sessions: Record<string, AgentSession>,
  notifications: AgentNotification[],
): AgentEntry[] {
  const notifByPanel = new Map<string, AgentNotification>();
  for (const n of notifications) {
    if (!notifByPanel.has(n.tabId)) notifByPanel.set(n.tabId, n);
  }

  const tabIds = new Set<string>([
    ...Object.keys(sessions),
    ...notifByPanel.keys(),
  ]);

  const entries: AgentEntry[] = [];
  for (const tabId of tabIds) {
    const session = sessions[tabId];
    const notif = notifByPanel.get(tabId);
    const agent = session?.agent ?? notif?.agent ?? "claude";
    const workspaceId = session?.workspaceId ?? notif?.workspaceId ?? "";

    let visual: AgentEntryVisual;
    let at: number;
    let pending: boolean;

    if (session?.restoreError) {
      visual = "error";
      at = session.lastActivityAt;
      pending = true;
    } else if (session?.status === "attention") {
      visual = "attention";
      at = session.attentionSince ?? session.lastActivityAt;
      pending = true;
    } else if (session?.status === "working") {
      visual = "working";
      at = session.lastActivityAt;
      pending = false;
    } else if (notif?.kind === "error") {
      visual = "error";
      at = notif.at;
      pending = !notif.read;
    } else {
      // Idle (already seen) or a stale attention whose session moved on: nothing
      // actionable to show.
      continue;
    }

    entries.push({ tabId, workspaceId, agent, visual, at, pending });
  }

  entries.sort((a, b) =>
    RANK[a.visual] !== RANK[b.visual]
      ? RANK[a.visual] - RANK[b.visual]
      : b.at - a.at,
  );

  return entries;
}
