import { useMemo, useRef, useState } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { hibernateReview, liveAgent, type HibernateLive } from "./hibernateReview";
import { liveScripts } from "./liveScripts";
import { getRunningCommandsSnapshot } from "./terminalEphemeralStore";
import { actionsToDelete, type Workspace } from "./types";

export type RunningProcess = { tabId: string; label: string };
export type PendingClose = { id: string; processes: RunningProcess[] };

// Scripts and agents already show up as busy rows, so a process listed for the
// same tab would be a duplicate.
export function closeProcesses(
  ws: Workspace,
  live: HibernateLive,
  processes: RunningProcess[],
): RunningProcess[] {
  const busy = new Set(hibernateReview(ws, live).busy.map((b) => b.tabId));
  return processes.filter((p) => !busy.has(p.tabId));
}

export function needsCloseConfirmation(
  ws: Workspace,
  live: HibernateLive,
  processes: RunningProcess[],
): boolean {
  const review = hibernateReview(ws, live);
  return (
    actionsToDelete(ws) > 0 ||
    review.busy.length > 0 ||
    review.docs.length > 0 ||
    closeProcesses(ws, live, processes).length > 0
  );
}

export type CloseFlowDeps = {
  getWorkspace: (workspaceId: string) => Workspace | undefined;
  autosaveEnabled: () => boolean;
  flushDirtyEditors: () => Promise<void>;
  settle: () => Promise<void>;
  live: (ws: Workspace) => HibernateLive;
  collectProcesses: (ws: Workspace) => Promise<RunningProcess[]>;
  close: (workspaceId: string) => Promise<void>;
  setPending: (pending: PendingClose | null) => void;
};

export function createCloseWorkspaceFlow(d: CloseFlowDeps) {
  const inFlight = new Set<string>();
  // The caller waiting for the confirmation dialog: true once the workspace is closed, false when
  // the dialog is cancelled or replaced.
  let waiter: { id: string; settle: (closed: boolean) => void } | null = null;

  function settleWaiter(closed: boolean, id?: string) {
    if (!waiter || (id !== undefined && waiter.id !== id)) return;
    const w = waiter;
    waiter = null;
    w.settle(closed);
  }

  async function perform(workspaceId: string): Promise<void> {
    if (inFlight.has(workspaceId)) return;
    inFlight.add(workspaceId);
    try {
      d.setPending(null);
      await d.close(workspaceId);
      settleWaiter(true, workspaceId);
    } catch (e) {
      settleWaiter(false, workspaceId);
      throw e;
    } finally {
      inFlight.delete(workspaceId);
    }
  }

  function cancel() {
    d.setPending(null);
    settleWaiter(false);
  }

  type Outcome = { status: "closed" | "none" } | { status: "asking"; decision: Promise<boolean> };

  async function run(workspaceId: string): Promise<Outcome> {
    if (!d.getWorkspace(workspaceId)) return { status: "none" };
    if (d.autosaveEnabled()) {
      await d.flushDirtyEditors();
      await d.settle();
    }
    const ws = d.getWorkspace(workspaceId);
    if (!ws) return { status: "none" };
    const live = d.live(ws);
    const processes = closeProcesses(ws, live, await d.collectProcesses(ws));
    if (!needsCloseConfirmation(ws, live, processes)) {
      await perform(workspaceId);
      return { status: "closed" };
    }
    settleWaiter(false);
    const decision = new Promise<boolean>((settle) => {
      waiter = { id: workspaceId, settle };
    });
    d.setPending({ id: workspaceId, processes });
    return { status: "asking", decision };
  }

  async function request(workspaceId: string): Promise<void> {
    await run(workspaceId);
  }

  // Resolves once the outcome is known, including the confirmation dialog: true when the
  // workspace was closed, false when nothing was closed.
  async function requestAndWait(workspaceId: string): Promise<boolean> {
    const outcome = await run(workspaceId);
    if (outcome.status === "asking") return outcome.decision;
    return outcome.status === "closed";
  }

  return { request, requestAndWait, perform, cancel };
}

const nextFrames = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

type HookDeps = {
  workspacesRef: { current: Workspace[] };
  flushDirtyEditors: () => Promise<void>;
  collectProcesses: (ws: Workspace) => Promise<RunningProcess[]>;
  close: (workspaceId: string) => Promise<void>;
};

export function useCloseWorkspaceFlow(deps: HookDeps) {
  const [pending, setPending] = useState<PendingClose | null>(null);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const flow = useMemo(
    () =>
      createCloseWorkspaceFlow({
        getWorkspace: (id) => depsRef.current.workspacesRef.current.find((w) => w.id === id),
        autosaveEnabled: () => usePreferencesStore.getState().editorAutoSave,
        flushDirtyEditors: () => depsRef.current.flushDirtyEditors(),
        settle: nextFrames,
        live: (ws) => {
          const sessions = useAgentStore.getState().sessions;
          const commands = getRunningCommandsSnapshot();
          return {
            agentOf: (id) => liveAgent(sessions[id]),
            runningCommand: (id) => commands.get(id),
            ...liveScripts(ws),
          };
        },
        collectProcesses: (ws) => depsRef.current.collectProcesses(ws),
        close: (id) => depsRef.current.close(id),
        setPending,
      }),
    [],
  );

  return {
    pending,
    requestClose: flow.request,
    requestCloseAndWait: flow.requestAndWait,
    performClose: flow.perform,
    cancel: flow.cancel,
  };
}
