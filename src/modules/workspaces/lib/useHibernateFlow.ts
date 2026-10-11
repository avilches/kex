import { useCallback, useMemo, useRef, useState } from "react";
import { markHibernating } from "@/modules/agents/lib/hibernatingTabs";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { terminalTabs } from "./hibernate";
import { hibernateReview, isReviewEmpty, liveAgent, type HibernateLive } from "./hibernateReview";
import { getRunningCommandsSnapshot, getScriptRunningSnapshot } from "./terminalEphemeralStore";
import type { Workspace } from "./types";

export type HibernateFlowDeps = {
  getWorkspace: (workspaceId: string) => Workspace | undefined;
  autosaveEnabled: () => boolean;
  flushDirtyEditors: () => Promise<void>;
  // Lets the dirty flags written by the flush reach the workspace state.
  settle: () => Promise<void>;
  live: () => HibernateLive;
  finishAgent: (tabId: string) => void;
  destroyFloats: (workspaceId: string) => Promise<void>;
  hibernate: (workspaceId: string) => void;
  setPending: (workspaceId: string | null) => void;
};

export function createHibernateFlow(d: HibernateFlowDeps) {
  const inFlight = new Set<string>();

  async function perform(workspaceId: string): Promise<void> {
    const ws = d.getWorkspace(workspaceId);
    if (!ws || ws.hibernated || inFlight.has(workspaceId)) return;
    inFlight.add(workspaceId);
    try {
      // First, so the dialog stops watching the stores this call is about to change.
      d.setPending(null);
      const ids = terminalTabs(ws).map((t) => t.id);
      markHibernating(ids);
      for (const id of ids) d.finishAgent(id);
      await d.destroyFloats(workspaceId);
      d.hibernate(workspaceId);
    } finally {
      inFlight.delete(workspaceId);
    }
  }

  async function request(workspaceId: string): Promise<void> {
    if (d.getWorkspace(workspaceId)?.hibernated) return;
    if (d.autosaveEnabled()) {
      await d.flushDirtyEditors();
      await d.settle();
    }
    const ws = d.getWorkspace(workspaceId);
    if (!ws || ws.hibernated) return;
    if (isReviewEmpty(hibernateReview(ws, d.live()))) {
      await perform(workspaceId);
      return;
    }
    d.setPending(workspaceId);
  }

  return { request, perform };
}

const nextFrames = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

type HookDeps = {
  workspacesRef: { current: Workspace[] };
  hibernateWorkspace: (workspaceId: string) => void;
  flushDirtyEditors: () => Promise<void>;
  destroyWorkspaceFloats: (workspaceId: string, workspaces: Workspace[]) => Promise<void>;
};

export function useHibernateFlow(deps: HookDeps) {
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | null>(null);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const flow = useMemo(
    () =>
      createHibernateFlow({
        getWorkspace: (id) => depsRef.current.workspacesRef.current.find((w) => w.id === id),
        autosaveEnabled: () => usePreferencesStore.getState().editorAutoSave,
        flushDirtyEditors: () => depsRef.current.flushDirtyEditors(),
        settle: nextFrames,
        live: () => {
          const sessions = useAgentStore.getState().sessions;
          const commands = getRunningCommandsSnapshot();
          const scripts = getScriptRunningSnapshot();
          return {
            agentOf: (id) => liveAgent(sessions[id]),
            runningCommand: (id) => commands.get(id),
            scriptState: (id) => scripts.get(id),
          };
        },
        finishAgent: (id) => useAgentStore.getState().finish(id),
        destroyFloats: (id) => depsRef.current.destroyWorkspaceFloats(id, depsRef.current.workspacesRef.current),
        hibernate: (id) => depsRef.current.hibernateWorkspace(id),
        setPending: setPendingWorkspaceId,
      }),
    [],
  );

  const cancel = useCallback(() => setPendingWorkspaceId(null), []);

  return {
    pendingWorkspaceId,
    requestHibernate: flow.request,
    performHibernate: flow.perform,
    cancel,
  };
}
