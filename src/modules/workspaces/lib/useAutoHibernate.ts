import { useEffect, useRef } from "react";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { autoHibernateTick } from "./autoHibernate";
import { busyTabIds, liveAgent } from "./hibernateReview";
import { liveScripts } from "./liveScripts";
import { allPanes } from "./splitNode";
import { getRunningCommandsSnapshot } from "./terminalEphemeralStore";
import type { Workspace } from "./types";

const CHECK_EVERY_MS = 60_000;

const hiddenSince = new Map<string, number>();

function busyIds(workspaces: readonly Workspace[]): Set<string> {
  const sessions = useAgentStore.getState().sessions;
  const commands = getRunningCommandsSnapshot();
  const ids = new Set<string>();
  for (const ws of workspaces) {
    const live = {
      agentOf: (id: string) => liveAgent(sessions[id]),
      runningCommand: (id: string) => commands.get(id),
      ...liveScripts(ws),
    };
    for (const id of busyTabIds(allPanes(ws.paneTree).flatMap((p) => p.tabs), live)) ids.add(id);
  }
  return ids;
}

type Deps = {
  workspacesRef: { current: Workspace[] };
  activeWorkspaceIdRef: { current: string | null };
  requestAutoHibernate: (workspaceId: string, tabIds: string[]) => Promise<boolean>;
};

export function useAutoHibernate(deps: Deps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const mode = usePreferencesStore((s) => s.autoHibernate);

  useEffect(() => {
    let running = false;
    const tick = async () => {
      const busy = running;
      running = true;
      try {
        const { workspacesRef, activeWorkspaceIdRef, requestAutoHibernate } = depsRef.current;
        const workspaces = workspacesRef.current;
        await autoHibernateTick({
          workspaces,
          activeId: activeWorkspaceIdRef.current,
          stamps: hiddenSince,
          busyTabIds: busyIds(workspaces),
          mode,
          busy,
          now: Date.now(),
          request: requestAutoHibernate,
        });
      } finally {
        if (!busy) running = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [mode]);
}
