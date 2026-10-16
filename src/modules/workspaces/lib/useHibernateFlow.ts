import { useCallback, useMemo, useRef, useState } from "react";
import { markHibernating, unmarkHibernating } from "@/modules/agents/lib/hibernatingTabs";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { previewResumeCmd } from "@/modules/agents/lib/agentSessionRestore";
import { hasTabs, restoreCommandFor, terminalTabs } from "./hibernate";
import { flushAgentTitles } from "./agentTitleSync";
import { tabDisplayTitleNow } from "./tabTitleNow";
import { flushSidebarSnapshots } from "./sidebarSnapshotSync";
import { hibernateReview, isReviewEmpty, liveAgent, type HibernateLive } from "./hibernateReview";
import { getRunningCommandsSnapshot, getScriptRunningSnapshot } from "./terminalEphemeralStore";
import type { TabHibernation, Workspace } from "./types";

export type HibernateFlowDeps = {
  getWorkspace: (workspaceId: string) => Workspace | undefined;
  // Saves every dirty document of the workspace whatever the autosave
  // preference says; resolves false when any save failed.
  saveWorkspaceDocs: (workspaceId: string) => Promise<boolean>;
  isActive: (workspaceId: string) => boolean;
  // Lets the dirty flags written by the flush reach the workspace state.
  settle: () => Promise<void>;
  live: () => HibernateLive;
  finishAgent: (tabId: string) => void;
  destroyFloats: (workspaceId: string) => Promise<void>;
  // Title, agent and restore command of every terminal tab, read while the PTYs are still alive.
  snapshotTabs: (workspace: Workspace) => Promise<Record<string, TabHibernation>>;
  hibernate: (workspaceId: string, snapshots: Record<string, TabHibernation>) => void;
  setPending: (workspaceId: string | null) => void;
};

export function createHibernateFlow(d: HibernateFlowDeps) {
  const inFlight = new Set<string>();

  // `stillValid` is checked after the only await, right before anything irreversible: marking
  // the tabs and ending their agent sessions would leave orphan records if the workspace were
  // not hibernated afterwards. Mark, finish and hibernate run with no await between them.
  async function perform(workspaceId: string, stillValid?: (ws: Workspace) => boolean): Promise<boolean> {
    const ws = d.getWorkspace(workspaceId);
    if (!ws || ws.hibernated || !hasTabs(ws) || inFlight.has(workspaceId)) return false;
    inFlight.add(workspaceId);
    try {
      // First, so the dialog stops watching the stores this call is about to change.
      d.setPending(null);
      const [, snapshots] = await Promise.all([
        d.destroyFloats(workspaceId),
        ws.hibernated ? {} : d.snapshotTabs(ws),
      ]);
      const current = d.getWorkspace(workspaceId);
      if (!current || current.hibernated || !hasTabs(current) || (stillValid && !stillValid(current))) return false;
      const ids = terminalTabs(current).map((t) => t.id);
      markHibernating(ids);
      try {
        for (const id of ids) d.finishAgent(id);
        d.hibernate(workspaceId, snapshots);
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
    const first = d.getWorkspace(workspaceId);
    if (!first || first.hibernated || !hasTabs(first)) return;
    // Whatever the autosave preference says: unsaved text outlives a hibernation only in memory.
    // A document that fails to save stays dirty and shows up in the dialog.
    await d.saveWorkspaceDocs(workspaceId);
    await d.settle();
    const ws = d.getWorkspace(workspaceId);
    if (!ws || ws.hibernated || !hasTabs(ws)) return;
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
    const first = d.getWorkspace(workspaceId);
    if (!first || first.hibernated || !hasTabs(first) || inFlight.has(workspaceId) || d.isActive(workspaceId)) {
      return false;
    }
    if (!(await d.saveWorkspaceDocs(workspaceId))) return false;
    await d.settle();
    const ws = d.getWorkspace(workspaceId);
    if (!ws || ws.hibernated || !hasTabs(ws) || d.isActive(workspaceId)) return false;
    const live = d.live();
    if (!isReviewEmpty(hibernateReview(ws, live))) return false;
    if (terminalTabs(ws).some((t) => live.agentOf(t.id)?.status === "attention")) return false;
    return perform(workspaceId, (current) => !d.isActive(workspaceId) && stillEmpty(current));
  }

  return { request, requestAuto, perform };
}

async function snapshotTerminalTabs(ws: Workspace): Promise<Record<string, TabHibernation>> {
  await flushAgentTitles();
  await flushSidebarSnapshots();
  const sessions = useAgentStore.getState().sessions;
  const entries = await Promise.all(
    terminalTabs(ws).map(async (tab): Promise<[string, TabHibernation]> => {
      const session = sessions[tab.id];
      const plan = session ? await previewResumeCmd(tab.id) : null;
      return [tab.id, { agent: session?.agent ?? plan?.agent, command: restoreCommandFor(tab, plan), title: tabDisplayTitleNow(tab) }];
    }),
  );
  return Object.fromEntries(entries);
}

const nextFrames = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

type HookDeps = {
  workspacesRef: { current: Workspace[] };
  saveWorkspaceDocs: (workspaceId: string) => Promise<boolean>;
  isActive: (workspaceId: string) => boolean;
  hibernateWorkspace: (workspaceId: string, snapshots: Record<string, TabHibernation>) => void;
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
        snapshotTabs: snapshotTerminalTabs,
        hibernate: (id, snapshots) => depsRef.current.hibernateWorkspace(id, snapshots),
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
