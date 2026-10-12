import type {
  AgentNotification,
  AgentSession,
  NotificationKind,
} from "./types";

/** What an agent tab shows that a restart would otherwise lose. */
export type AgentSnapshot = {
  title: string;
  notification: NotificationKind | "";
};

export function snapshotKey(s: AgentSnapshot): string {
  return `${s.notification}\u0000${s.title}`;
}

/**
 * The name the tab shows (the title the agent sent, else the session title) and
 * the notification still waiting for the user: an unread bell entry, else the
 * attention dot the session carries.
 */
export function agentSnapshot(
  session: AgentSession,
  oscTitle: string | undefined,
  notifications: AgentNotification[],
): AgentSnapshot {
  const unread = notifications.find((n) => n.tabId === session.tabId && !n.read);
  const notification: AgentSnapshot["notification"] = unread
    ? unread.kind
    : session.status === "attention"
      ? "attention"
      : "";
  return {
    title: oscTitle ?? session.meta?.sessionTitle ?? "",
    notification,
  };
}

/**
 * Snapshots that differ from what was last sent, and the new "last sent" map.
 * Sessions that ended drop out of the map, so a session on the same tab starts
 * from scratch. A failed restore has nothing worth keeping, and a session whose id is not
 * known yet is left for the next pass: Rust scopes a snapshot to a session id, so an in-flight
 * write of an old session (after /clear) cannot land on the new one.
 */
export function changedSnapshots(
  sessions: Record<string, AgentSession>,
  notifications: AgentNotification[],
  titleOf: (tabId: string) => string | undefined,
  sent: ReadonlyMap<string, string>,
): {
  changes: { tabId: string; sessionId: string; snapshot: AgentSnapshot }[];
  sent: Map<string, string>;
} {
  const nextSent = new Map<string, string>();
  const changes: { tabId: string; sessionId: string; snapshot: AgentSnapshot }[] = [];
  for (const session of Object.values(sessions)) {
    const sessionId = session.meta?.sessionId;
    if (session.restoreError || !sessionId) continue;
    const snapshot = agentSnapshot(session, titleOf(session.tabId), notifications);
    const key = `${sessionId}\u0000${snapshotKey(snapshot)}`;
    nextSent.set(session.tabId, key);
    if (sent.get(session.tabId) !== key) {
      changes.push({ tabId: session.tabId, sessionId, snapshot });
    }
  }
  return { changes, sent: nextSent };
}
