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
 * agent-sessions.json so a restart can put them back. Writes are debounced and
 * only the tabs whose snapshot changed are sent, since the agent retitles its
 * tab all the time.
 */
export function startAgentSnapshotSync(): () => void {
  let sent = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const { sessions, notifications } = useAgentStore.getState();
    const result = changedSnapshots(sessions, notifications, getOscTitle, sent);
    sent = result.sent;
    for (const { tabId, snapshot } of result.changes) {
      void invoke("agent_session_set_snapshot", {
        tabId,
        title: snapshot.title,
        notification: snapshot.notification,
      }).catch(() => {});
    }
  };
  const schedule = () => {
    if (timer === null) timer = setTimeout(flush, FLUSH_MS);
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
  schedule();

  return () => {
    unsubStore();
    unsubTitles();
    if (timer !== null) clearTimeout(timer);
  };
}
