import { useCallback, useMemo, useRef, useState } from "react";
import { markHibernating, unmarkHibernating } from "@/modules/agents/lib/hibernatingTabs";
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
  // Saves every dirty document of the workspace whatever the autosave
  // preference says; resolves false when any save failed.
  saveWorkspaceDocs: (workspaceId: string) => Promise<boolean>;
  isActive: (workspaceId: string) => boolean;
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

  // `stillValid` is checked after the only await, right before anything irreversible: marking
  // the tabs and ending their agent sessions would leave orphan records if the workspace were
  // not hibernated afterwards. Mark, finish and hibernate run with no await between them.
  async function perform(workspaceId: string, stillValid?: (ws: Workspace) => boolean): Promise<boolean> {
    const ws = d.getWorkspace(workspaceId);
    if (!ws || ws.hibernated || inFlight.has(workspaceId)) return false;
    inFlight.add(workspaceId);
    try {
      // First, so the dialog stops watching the stores this call is about to change.
      d.setPending(null);
      await d.destroyFloats(workspaceId);
      const current = d.getWorkspace(workspaceId);
      if (!current || current.hibernated || (stillValid && !stillValid(current))) return false;
      const ids = terminalTabs(current).map((t) => t.id);
      markHibernating(ids);
      try {
        for (const id of ids) d.finishAgent(id);
        d.hibernate(workspaceId);
      } catch (e) {
        unmarkHibernating(ids);
        throw e;
      }
      return true;
    } finally {
      inFlight.delete(workspaceId);
    }
  }

  // The review was empty when it was taken; the user may have edited a document, or activated
  // the workspace of an unattended hibernation, since.
  const stillEmpty = (ws: Workspace) => isReviewEmpty(hibernateReview(ws, d.live()));

  async function request(workspaceId: string): Promise<void> {
    if (d.getWorkspace(workspaceId)?.hibernated) return;
    if (d.autosaveEnabled()) {
      await d.flushDirtyEditors();
      await d.settle();
    }
    const ws = d.getWorkspace(workspaceId);
    if (!ws || ws.hibernated) return;
    if (isReviewEmpty(hibernateReview(ws, d.live()))) {
      await perform(workspaceId, stillEmpty);
      return;
    }
    d.setPending(workspaceId);
  }

  // Unattended variant: saves what is dirty and hibernates only when nothing
  // is left to ask about (no busy tab, no unsaved document, no command that
  // would be lost). It never opens the dialog.
  async function requestAuto(workspaceId: string): Promise<boolean> {
    if (d.getWorkspace(workspaceId)?.hibernated || inFlight.has(workspaceId) || d.isActive(workspaceId)) {
      return false;
    }
    if (!(await d.saveWorkspaceDocs(workspaceId))) return false;
    await d.settle();
    const ws = d.getWorkspace(workspaceId);
    if (!ws || ws.hibernated || d.isActive(workspaceId)) return false;
    const live = d.live();
    if (!isReviewEmpty(hibernateReview(ws, live))) return false;
    if (terminalTabs(ws).some((t) => live.agentOf(t.id)?.status === "attention")) return false;
    return perform(workspaceId, (current) => !d.isActive(workspaceId) && stillEmpty(current));
  }

  return { request, requestAuto, perform };
}

const nextFrames = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

type HookDeps = {
  workspacesRef: { current: Workspace[] };
  saveWorkspaceDocs: (workspaceId: string) => Promise<boolean>;
  isActive: (workspaceId: string) => boolean;
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
        saveWorkspaceDocs: (id) => depsRef.current.saveWorkspaceDocs(id),
        isActive: (id) => depsRef.current.isActive(id),
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
    requestAutoHibernate: flow.requestAuto,
    performHibernate: flow.perform,
    cancel,
  };
}
