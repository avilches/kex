import type { AgentNotification, AgentSession } from "./types";

export type AgentEntryVisual = "waiting" | "working" | "error";

export type AgentEntry = {
  panelId: string;
  tabId: string;
  agent: string;
  visual: AgentEntryVisual;
  at: number;
  /** Drives the bell badge: a pending attention or an unread terminal event. */
  pending: boolean;
};

const RANK: Record<AgentEntryVisual, number> = {
  waiting: 0,
  working: 1,
  error: 2,
};

/**
 * Collapse live sessions and the notification log into a single entry per agent
 * (keyed by panelId), showing only what is actionable: agents that need
 * attention (waiting/error) or are still working. An idle agent has already been
 * seen, so it is dropped. The orange dot is derived from the live session, so a
 * bell row stays in sync with its tab. Order: waiting, then working, then error;
 * newest first within each group.
 */
export function buildAgentEntries(
  sessions: Record<string, AgentSession>,
  notifications: AgentNotification[],
): AgentEntry[] {
  const notifByPanel = new Map<string, AgentNotification>();
  for (const n of notifications) {
    if (!notifByPanel.has(n.panelId)) notifByPanel.set(n.panelId, n);
  }

  const panelIds = new Set<string>([
    ...Object.keys(sessions),
    ...notifByPanel.keys(),
  ]);

  const entries: AgentEntry[] = [];
  for (const panelId of panelIds) {
    const session = sessions[panelId];
    const notif = notifByPanel.get(panelId);
    const agent = session?.agent ?? notif?.agent ?? "claude";
    const tabId = session?.tabId ?? notif?.tabId ?? "";

    let visual: AgentEntryVisual;
    let at: number;
    let pending: boolean;

    if (session?.restoreError) {
      visual = "error";
      at = session.lastActivityAt;
      pending = true;
    } else if (session?.status === "waiting") {
      visual = "waiting";
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

    entries.push({ panelId, tabId, agent, visual, at, pending });
  }

  entries.sort((a, b) =>
    RANK[a.visual] !== RANK[b.visual]
      ? RANK[a.visual] - RANK[b.visual]
      : b.at - a.at,
  );

  return entries;
}
