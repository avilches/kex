import { create } from "zustand";
import type {
  AgentNotification,
  AgentSession,
  AgentSessionMeta,
  AgentStatus,
  LocalAgentState,
} from "../lib/types";

const MAX_NOTIFICATIONS = 50;

let notifSeq = 0;

type AgentStoreState = {
  sessions: Record<string, AgentSession>;
  localAgent: LocalAgentState;
  notifications: AgentNotification[];
  start: (panelId: string, tabId: string, agent: string) => void;
  startIdle: (panelId: string, tabId: string, agent: string) => void;
  setStatus: (panelId: string, status: AgentStatus) => void;
  finish: (panelId: string) => void;
  startRestored: (panelId: string, tabId: string, agent: string) => void;
  setRestoreError: (panelId: string, tabId: string, agent: string, reason?: string) => void;
  clearRestored: (panelId: string) => void;
  setMeta: (panelId: string, meta: Partial<AgentSessionMeta>) => void;
  setLocalAgent: (state: LocalAgentState) => void;
  pushNotification: (
    n: Omit<AgentNotification, "id" | "at" | "read">,
  ) => void;
  markAllRead: () => void;
  clearNotifications: () => void;
};

export const useAgentStore = create<AgentStoreState>((set) => ({
  sessions: {},
  localAgent: null,
  notifications: [],

  start: (panelId, tabId, agent) =>
    set((s) => {
      const now = Date.now();
      return {
        sessions: {
          ...s.sessions,
          [panelId]: {
            panelId,
            tabId,
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

  startIdle: (panelId, tabId, agent) =>
    set((s) => {
      const now = Date.now();
      return {
        sessions: {
          ...s.sessions,
          [panelId]: {
            panelId,
            tabId,
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

  setStatus: (panelId, status) =>
    set((s) => {
      const prev = s.sessions[panelId];
      if (!prev || prev.status === status) return s;
      const now = Date.now();
      return {
        sessions: {
          ...s.sessions,
          [panelId]: {
            ...prev,
            status,
            lastActivityAt: now,
            attentionSince: status === "waiting" ? now : null,
            restored: false,
          },
        },
      };
    }),

  finish: (panelId) =>
    set((s) => {
      if (!s.sessions[panelId]) return s;
      const next = { ...s.sessions };
      delete next[panelId];
      return { sessions: next };
    }),

  startRestored: (panelId, tabId, agent) =>
    set((s) => {
      const now = Date.now();
      return {
        sessions: {
          ...s.sessions,
          [panelId]: {
            panelId,
            tabId,
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

  setRestoreError: (panelId, tabId, agent, reason) =>
    set((s) => {
      const now = Date.now();
      return {
        sessions: {
          ...s.sessions,
          [panelId]: {
            panelId,
            tabId,
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

  clearRestored: (panelId) =>
    set((s) => {
      const prev = s.sessions[panelId];
      if (!prev?.restored) return s;
      return {
        sessions: {
          ...s.sessions,
          [panelId]: { ...prev, restored: false },
        },
      };
    }),

  setMeta: (panelId, meta) =>
    set((s) => {
      const prev = s.sessions[panelId];
      if (!prev) return s;
      return {
        sessions: {
          ...s.sessions,
          [panelId]: { ...prev, meta: { ...prev.meta, ...meta } },
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
    set((s) => ({
      notifications: [
        { ...n, id: `n${++notifSeq}`, at: Date.now(), read: false },
        ...s.notifications,
      ].slice(0, MAX_NOTIFICATIONS),
    })),

  markAllRead: () =>
    set((s) => {
      if (!s.notifications.some((n) => !n.read)) return s;
      return { notifications: s.notifications.map((n) => ({ ...n, read: true })) };
    }),

  clearNotifications: () => set({ notifications: [] }),
}));
