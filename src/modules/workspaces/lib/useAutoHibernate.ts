import { useEffect, useRef } from "react";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { autoHibernateTick, hibernatedIds, stampSwitch } from "./autoHibernate";
import type { Workspace } from "./types";
import { activityStamps, saveWorkspaceState } from "./workspaceState";

const CHECK_EVERY_MS = 60_000;

function busyWorkspaceIds(): Set<string> {
  const ids = new Set<string>();
  for (const session of Object.values(useAgentStore.getState().sessions)) {
    if (session.status === "working") ids.add(session.workspaceId);
  }
  return ids;
}

type Deps = {
  workspacesRef: { current: Workspace[] };
  activeWorkspaceId: string | null;
  activeWorkspaceIdRef: { current: string | null };
  requestAutoHibernate: (workspaceId: string) => Promise<boolean>;
};

export function useAutoHibernate(deps: Deps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const mode = usePreferencesStore((s) => s.autoHibernate);

  const previousActiveRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousActiveRef.current;
    previousActiveRef.current = deps.activeWorkspaceId;
    stampSwitch(activityStamps, depsRef.current.workspacesRef.current, previous, deps.activeWorkspaceId, Date.now());
  }, [deps.activeWorkspaceId]);

  const hibernatedSeenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    hibernatedSeenRef.current ??= hibernatedIds(depsRef.current.workspacesRef.current);
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
          stamps: activityStamps,
          hibernatedSeen: hibernatedSeenRef.current!,
          busyIds: busyWorkspaceIds(),
          mode,
          busy,
          now: Date.now(),
          save: () =>
            saveWorkspaceState(workspaces, workspaces.findIndex((w) => w.id === activeWorkspaceIdRef.current)),
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
