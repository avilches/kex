import { invoke } from "@tauri-apps/api/core";
import {
  getOscTitle,
  subscribe as subscribeOscTitles,
} from "@/modules/terminal/lib/oscTitleStore";
import { useAgentStore } from "../store/agentStore";
import { changedSnapshots } from "./agentSnapshot";

const FLUSH_MS = 1500;

/**
 * Keeps the name and pending notification of every agent tab in
 * agent-sessions.json so a restart can put them back. Writes are batched (one
 * flush 1.5s after the first change of a burst) and only the tabs whose snapshot changed are sent, since the agent retitles its
 * tab all the time. A pending write is flushed when the window closes, and a
 * tab Rust has no record for yet is sent again on its next change.
 */
export function startAgentSnapshotSync(): () => void {
  let sent = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const { sessions, notifications } = useAgentStore.getState();
    const result = changedSnapshots(sessions, notifications, getOscTitle, sent);
    sent = result.sent;
    for (const { tabId, sessionId, snapshot } of result.changes) {
      invoke<boolean>("agent_session_set_snapshot", {
        tabId,
        sessionId,
        title: snapshot.title,
        notification: snapshot.notification,
      })
        .then((recorded) => {
          if (!recorded) sent.delete(tabId);
        })
        .catch(() => sent.delete(tabId));
    }
  };
  const schedule = () => {
    if (timer === null) timer = setTimeout(flush, FLUSH_MS);
  };
  const flushPending = () => {
    if (timer !== null) flush();
  };

  const unsubStore = useAgentStore.subscribe((state, prev) => {
    if (
      state.sessions !== prev.sessions ||
      state.notifications !== prev.notifications
    ) {
      schedule();
    }
  });
  const unsubTitles = subscribeOscTitles(schedule);
  window.addEventListener("beforeunload", flushPending);
  schedule();

  return () => {
    unsubStore();
    unsubTitles();
    window.removeEventListener("beforeunload", flushPending);
    flushPending();
  };
}
