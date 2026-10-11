import { useCallback, useMemo, useRef, useState } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { hibernateReview, liveAgent, type HibernateLive } from "./hibernateReview";
import { getRunningCommandsSnapshot, getScriptRunningSnapshot } from "./terminalEphemeralStore";
import type { Workspace } from "./types";

export type RunningProcess = { tabId: string; label: string };
export type PendingClose = { id: string; processes: RunningProcess[] };

export function scriptsToDelete(ws: Workspace): number {
  return ws.scripts?.filter((s) => s.command.trim()).length ?? 0;
}

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
    scriptsToDelete(ws) > 0 ||
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
  live: () => HibernateLive;
  collectProcesses: (ws: Workspace) => Promise<RunningProcess[]>;
  close: (workspaceId: string) => Promise<void>;
  setPending: (pending: PendingClose | null) => void;
};

export function createCloseWorkspaceFlow(d: CloseFlowDeps) {
  const inFlight = new Set<string>();

  async function perform(workspaceId: string): Promise<void> {
    if (inFlight.has(workspaceId)) return;
    inFlight.add(workspaceId);
    try {
      d.setPending(null);
      await d.close(workspaceId);
    } finally {
      inFlight.delete(workspaceId);
    }
  }

  async function request(workspaceId: string): Promise<void> {
    if (!d.getWorkspace(workspaceId)) return;
    if (d.autosaveEnabled()) {
      await d.flushDirtyEditors();
      await d.settle();
    }
    const ws = d.getWorkspace(workspaceId);
    if (!ws) return;
    const live = d.live();
    const processes = closeProcesses(ws, live, await d.collectProcesses(ws));
    if (!needsCloseConfirmation(ws, live, processes)) {
      await perform(workspaceId);
      return;
    }
    d.setPending({ id: workspaceId, processes });
  }

  return { request, perform };
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
        collectProcesses: (ws) => depsRef.current.collectProcesses(ws),
        close: (id) => depsRef.current.close(id),
        setPending,
      }),
    [],
  );

  const cancel = useCallback(() => setPending(null), []);

  return { pending, requestClose: flow.request, performClose: flow.perform, cancel };
}
