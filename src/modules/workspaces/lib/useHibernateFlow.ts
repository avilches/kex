import { useCallback, useMemo, useRef, useState } from "react";
import { markHibernating, unmarkHibernating } from "@/modules/agents/lib/hibernatingTabs";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { previewResumeCmd } from "@/modules/agents/lib/agentSessionRestore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { awakeTerminalTabs, restoreCommandFor } from "./hibernate";
import { HIBERNATE_LINES_MAX, prepareHibernateLines } from "./hibernateLines";
import { saveHibernateLines } from "./hibernateLinesIo";
import { flushAgentTitles } from "./agentTitleSync";
import { tabDisplayTitleNow } from "./tabTitleNow";
import { flushSidebarSnapshots } from "./sidebarSnapshotSync";
import { busyTabIds, isReviewEmpty, liveAgent, tabsReview, type HibernateLive } from "./hibernateReview";
import { visibleTabIds } from "./autoHibernate";
import { liveScripts } from "./liveScripts";
import { getRunningCommandsSnapshot } from "./terminalEphemeralStore";
import type { Tab, TabHibernation, Workspace } from "./types";

type TerminalTab = Extract<Tab, { kind: "terminal" }>;

export type PendingHibernate = { workspaceId: string; tabIds: string[] };

export type HibernateFlowDeps = {
  getWorkspace: (workspaceId: string) => Workspace | undefined;
  activeWorkspaceId: () => string | null;
  live: (ws: Workspace) => HibernateLive;
  finishAgent: (tabId: string) => void;
  // Title, agent and restore command of the tabs, read while their PTYs are still alive.
  snapshotTabs: (tabs: TerminalTab[]) => Promise<Record<string, TabHibernation>>;
  hibernate: (workspaceId: string, snapshots: Record<string, TabHibernation>) => void;
  setPending: (pending: PendingHibernate | null) => void;
};

export function createHibernateFlow(d: HibernateFlowDeps) {
  const inFlight = new Set<string>();

  const awake = (ws: Workspace, tabIds: readonly string[]) => {
    const wanted = new Set(tabIds);
    return awakeTerminalTabs(ws).filter((t) => wanted.has(t.id));
  };

  // Tabs an unattended hibernation may take: out of sight, not busy and with nothing that
  // would be lost.
  const unattended = (ws: Workspace, tabIds: readonly string[]) => {
    const tabs = awake(ws, tabIds);
    const live = d.live(ws);
    const visible = visibleTabIds([ws], ws.id === d.activeWorkspaceId() ? ws.id : null);
    const busy = busyTabIds(tabs, live);
    const lost = new Set(tabsReview(tabs, live).commands.map((c) => c.tabId));
    return tabs.filter((t) => !visible.has(t.id) && !busy.has(t.id) && !lost.has(t.id));
  };

  // `stillValid` is checked after the only await, right before anything irreversible: marking
  // the tabs and ending their agent sessions would leave orphan records if they were not put to
  // sleep afterwards. Mark, finish and hibernate run with no await between them.
  async function perform(
    workspaceId: string,
    tabIds: readonly string[],
    stillValid?: (ws: Workspace, tabIds: readonly string[]) => TerminalTab[],
  ): Promise<boolean> {
    const ws = d.getWorkspace(workspaceId);
    if (!ws) return false;
    const tabs = awake(ws, tabIds).filter((t) => !inFlight.has(t.id));
    if (tabs.length === 0) return false;
    const ids = tabs.map((t) => t.id);
    for (const id of ids) inFlight.add(id);
    try {
      // First, so the dialog stops watching the stores this call is about to change.
      d.setPending(null);
      const snapshots = await d.snapshotTabs(tabs);
      const current = d.getWorkspace(workspaceId);
      if (!current) return false;
      const still = (stillValid ?? awake)(current, ids);
      if (still.length === 0) return false;
      const stillIds = still.map((t) => t.id);
      markHibernating(stillIds);
      try {
        for (const id of stillIds) d.finishAgent(id);
        d.hibernate(workspaceId, snapshots);
      } catch (e) {
        unmarkHibernating(stillIds);
        throw e;
      }
      return true;
    } finally {
      for (const id of ids) inFlight.delete(id);
    }
  }

  async function request(workspaceId: string, tabIds: readonly string[]): Promise<void> {
    const ws = d.getWorkspace(workspaceId);
    if (!ws) return;
    const tabs = awake(ws, tabIds);
    if (tabs.length === 0) return;
    if (isReviewEmpty(tabsReview(tabs, d.live(ws)))) {
      await perform(workspaceId, tabIds);
      return;
    }
    d.setPending({ workspaceId, tabIds: tabs.map((t) => t.id) });
  }

  // Unattended variant: hibernates only the tabs nobody is looking at and nothing would be
  // lost in. It never opens the dialog.
  async function requestAuto(workspaceId: string, tabIds: readonly string[]): Promise<boolean> {
    const ws = d.getWorkspace(workspaceId);
    if (!ws) return false;
    const ids = unattended(ws, tabIds).filter((t) => !inFlight.has(t.id)).map((t) => t.id);
    if (ids.length === 0) return false;
    return perform(workspaceId, ids, unattended);
  }

  return { request, requestAuto, perform };
}

export type ReadLeafAnsi = (tabId: string, scrollback: number) => string | null;

// A failure here must not stop the tab from sleeping: the placeholder just shows no lines.
export async function keepLastLines(tabs: TerminalTab[], readAnsi: ReadLeafAnsi): Promise<void> {
  if (!usePreferencesStore.getState().hibernateSaveLines) return;
  await Promise.all(
    tabs.map(async (tab) => {
      try {
        const raw = readAnsi(tab.id, HIBERNATE_LINES_MAX);
        const text = raw ? prepareHibernateLines(raw) : "";
        if (text) await saveHibernateLines(tab.id, text);
      } catch (e) {
        console.warn("[kex] could not keep the last lines of", tab.id, e);
      }
    }),
  );
}

async function snapshotTerminalTabs(tabs: TerminalTab[], readAnsi: ReadLeafAnsi): Promise<Record<string, TabHibernation>> {
  await flushAgentTitles();
  await flushSidebarSnapshots();
  await keepLastLines(tabs, readAnsi);
  const sessions = useAgentStore.getState().sessions;
  const at = Date.now();
  const entries = await Promise.all(
    tabs.map(async (tab): Promise<[string, TabHibernation]> => {
      const session = sessions[tab.id];
      const plan = session ? await previewResumeCmd(tab.id) : null;
      return [tab.id, { at, agent: session?.agent ?? plan?.agent, command: restoreCommandFor(tab, plan), title: tabDisplayTitleNow(tab) }];
    }),
  );
  return Object.fromEntries(entries);
}

type HookDeps = {
  workspacesRef: { current: Workspace[] };
  activeWorkspaceIdRef: { current: string | null };
  hibernateWorkspace: (workspaceId: string, snapshots: Record<string, TabHibernation>) => void;
  readLeafAnsi: ReadLeafAnsi;
};

export function useHibernateFlow(deps: HookDeps) {
  const [pending, setPending] = useState<PendingHibernate | null>(null);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const flow = useMemo(
    () =>
      createHibernateFlow({
        getWorkspace: (id) => depsRef.current.workspacesRef.current.find((w) => w.id === id),
        activeWorkspaceId: () => depsRef.current.activeWorkspaceIdRef.current,
        live: (ws) => {
          const sessions = useAgentStore.getState().sessions;
          const commands = getRunningCommandsSnapshot();
          return {
            agentOf: (id) => liveAgent(sessions[id]),
            runningCommand: (id) => commands.get(id),
            ...liveScripts(ws),
          };
        },
        finishAgent: (id) => useAgentStore.getState().finish(id),
        snapshotTabs: (tabs) => snapshotTerminalTabs(tabs, depsRef.current.readLeafAnsi),
        hibernate: (id, snapshots) => depsRef.current.hibernateWorkspace(id, snapshots),
        setPending,
      }),
    [],
  );

  const cancel = useCallback(() => setPending(null), []);

  return {
    pending,
    requestHibernate: flow.request,
    requestAutoHibernate: flow.requestAuto,
    performHibernate: flow.perform,
    cancel,
  };
}
