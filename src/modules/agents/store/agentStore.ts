import { create } from "zustand";
import { sameLocations } from "@/modules/workspaces/lib/tabLocations";
import type {
  AgentNotification,
  AgentSession,
  AgentSessionMeta,
  AgentStatus,
  LocalAgentState,
} from "../lib/types";

const MAX_NOTIFICATIONS = 50;
const MAX_CLOSED = 20;

let notifSeq = 0;

type AgentStoreState = {
  sessions: Record<string, AgentSession>;
  localAgent: LocalAgentState;
  notifications: AgentNotification[];
  /** tabId -> workspaceId of every live tab; null until the app reports it. */
  tabLocations: Record<string, string> | null;
  setTabLocations: (locations: Record<string, string>) => void;
  /** Sessions of closed tabs that were waiting on the user, by their old tab id. */
  closedSessions: Record<string, AgentSession>;
  stashClosedSession: (tabId: string) => void;
  restoreClosedSession: (
    oldTabId: string,
    newTabId: string,
    workspaceId: string,
  ) => void;
  start: (tabId: string, workspaceId: string, agent: string) => void;
  startIdle: (tabId: string, workspaceId: string, agent: string) => void;
  setStatus: (tabId: string, status: AgentStatus) => void;
  finish: (tabId: string) => void;
  startRestored: (tabId: string, workspaceId: string, agent: string) => void;
  setRestoreError: (
    tabId: string,
    workspaceId: string,
    agent: string,
    reason?: string,
  ) => void;
  clearRestored: (tabId: string) => void;
  setMeta: (tabId: string, meta: Partial<AgentSessionMeta>) => void;
  setLocalAgent: (state: LocalAgentState) => void;
  pushNotification: (n: Omit<AgentNotification, "id" | "at" | "read">) => void;
  markTabSeen: (tabId: string) => void;
  markAllRead: () => void;
  clearNotifications: () => void;
  clearAll: () => void;
};

export const useAgentStore = create<AgentStoreState>((set) => ({
  sessions: {},
  localAgent: null,
  notifications: [],
  tabLocations: null,
  closedSessions: {},

  start: (tabId, workspaceId, agent) =>
    set((s) => {
      const now = Date.now();
      return {
        sessions: {
          ...s.sessions,
          [tabId]: {
            tabId,
            workspaceId,
            agent,
            status: "working",
            startedAt: now,
            lastActivityAt: now,
            attentionSince: null,
            restored: false,
            restoreError: false,
          },
        },
      };
    }),

  startIdle: (tabId, workspaceId, agent) =>
    set((s) => {
      const now = Date.now();
      return {
        sessions: {
          ...s.sessions,
          [tabId]: {
            tabId,
            workspaceId,
            agent,
            status: "idle",
            startedAt: now,
            lastActivityAt: now,
            attentionSince: null,
            restored: false,
            restoreError: false,
          },
        },
      };
    }),

  setStatus: (tabId, status) =>
    set((s) => {
      const prev = s.sessions[tabId];
      if (!prev || prev.status === status) return s;
      const now = Date.now();
      return {
        sessions: {
          ...s.sessions,
          [tabId]: {
            ...prev,
            status,
            lastActivityAt: now,
            attentionSince: status === "attention" ? now : null,
            restored: false,
          },
        },
      };
    }),

  finish: (tabId) =>
    set((s) => {
      if (!s.sessions[tabId]) return s;
      const next = { ...s.sessions };
      delete next[tabId];
      return { sessions: next };
    }),

  startRestored: (tabId, workspaceId, agent) =>
    set((s) => {
      const now = Date.now();
      return {
        sessions: {
          ...s.sessions,
          [tabId]: {
            tabId,
            workspaceId,
            agent,
            status: "working",
            startedAt: now,
            lastActivityAt: now,
            attentionSince: null,
            restored: true,
            restoreError: false,
          },
        },
      };
    }),

  setRestoreError: (tabId, workspaceId, agent, reason) =>
    set((s) => {
      const now = Date.now();
      return {
        sessions: {
          ...s.sessions,
          [tabId]: {
            tabId,
            workspaceId,
            agent,
            status: "working",
            startedAt: now,
            lastActivityAt: now,
            attentionSince: null,
            restored: false,
            restoreError: true,
            restoreErrorReason: reason,
          },
        },
      };
    }),

  clearRestored: (tabId) =>
    set((s) => {
      const prev = s.sessions[tabId];
      if (!prev?.restored) return s;
      return {
        sessions: {
          ...s.sessions,
          [tabId]: { ...prev, restored: false },
        },
      };
    }),

  setMeta: (tabId, meta) =>
    set((s) => {
      const prev = s.sessions[tabId];
      if (!prev) return s;
      return {
        sessions: {
          ...s.sessions,
          [tabId]: { ...prev, meta: { ...prev.meta, ...meta } },
        },
      };
    }),

  setLocalAgent: (state) =>
    set((s) => {
      const a = s.localAgent;
      if (a === state) return s;
      if (a && state && a.status === state.status && a.agent === state.agent) {
        return s;
      }
      return { localAgent: state };
    }),

  pushNotification: (n) =>
    set((s) => {
      // One notification per agent (tabId): drop any previous entry for the
      // same tab and reinsert at the front so it bubbles to the top.
      const rest = s.notifications.filter((x) => x.tabId !== n.tabId);
      return {
        notifications: [
          { ...n, id: `n${++notifSeq}`, at: Date.now(), read: false },
          ...rest,
        ].slice(0, MAX_NOTIFICATIONS),
      };
    }),

  markTabSeen: (tabId) =>
    set((s) => {
      const prev = s.sessions[tabId];
      const clearsDot = prev?.status === "attention";
      const notif = s.notifications.find((n) => n.tabId === tabId);
      const marksRead = notif ? !notif.read : false;
      if (!clearsDot && !marksRead) return s;
      const now = Date.now();
      return {
        sessions:
          prev && clearsDot
            ? {
                ...s.sessions,
                [tabId]: {
                  ...prev,
                  status: "idle",
                  attentionSince: null,
                  lastActivityAt: now,
                },
              }
            : s.sessions,
        notifications: marksRead
          ? s.notifications.map((n) =>
              n.tabId === tabId ? { ...n, read: true } : n,
            )
          : s.notifications,
      };
    }),

  markAllRead: () =>
    set((s) => {
      if (!s.notifications.some((n) => !n.read)) return s;
      return {
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
      };
    }),

  setTabLocations: (locations) =>
    set((s) =>
      sameLocations(s.tabLocations, locations) ? s : { tabLocations: locations },
    ),

  // Closing the tab kills the agent and drops its session, so an attention state
  // would be lost for good. Keep it aside in case the tab is reopened.
  stashClosedSession: (tabId) =>
    set((s) => {
      const session = s.sessions[tabId];
      if (session?.status !== "attention") return s;
      const kept = Object.entries(s.closedSessions).slice(-(MAX_CLOSED - 1));
      return { closedSessions: { ...Object.fromEntries(kept), [tabId]: session } };
    }),

  // A reopened tab gets a fresh id: its stashed session and its notification follow it.
  restoreClosedSession: (oldTabId, newTabId, workspaceId) =>
    set((s) => {
      const stashed = s.closedSessions[oldTabId];
      const hasNotif = s.notifications.some((n) => n.tabId === oldTabId);
      if (!stashed && !hasNotif) return s;
      const { [oldTabId]: _gone, ...closedSessions } = s.closedSessions;
      return {
        closedSessions,
        sessions: stashed
          ? {
              ...s.sessions,
              [newTabId]: { ...stashed, tabId: newTabId, workspaceId },
            }
          : s.sessions,
        notifications: s.notifications.map((n) =>
          n.tabId === oldTabId ? { ...n, tabId: newTabId, workspaceId } : n,
        ),
      };
    }),

  clearNotifications: () => set({ notifications: [] }),

  // "Clear all": drop every notification and clear every attention dot (attention
  // sessions go idle). Working sessions are left running.
  clearAll: () =>
    set((s) => {
      let changed = s.notifications.length > 0;
      const sessions: Record<string, AgentSession> = {};
      const now = Date.now();
      for (const [id, sess] of Object.entries(s.sessions)) {
        if (sess.status === "attention") {
          sessions[id] = {
            ...sess,
            status: "idle",
            attentionSince: null,
            lastActivityAt: now,
          };
          changed = true;
        } else {
          sessions[id] = sess;
        }
      }
      if (!changed) return s;
      return { sessions, notifications: [] };
    }),
}));

if (import.meta.env?.DEV && typeof window !== "undefined") {
  (
    window as unknown as {
      __kexAgents?: {
        sessions: () => AgentSession[];
        fakeNotification: (
          tabId: string,
          kind?: "attention" | "finished" | "error",
          agent?: string,
        ) => void;
      };
    }
  ).__kexAgents = {
    sessions() {
      return Object.values(useAgentStore.getState().sessions);
    },
    fakeNotification(tabId, kind = "attention", agent = "claude") {
      const session = useAgentStore.getState().sessions[tabId];
      const workspaceId = session?.workspaceId ?? tabId;
      useAgentStore.getState().pushNotification({ source: "terminal", tabId, workspaceId, agent, kind });
    },
  };
}
