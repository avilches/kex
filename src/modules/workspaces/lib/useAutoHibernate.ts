import { useEffect, useRef } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { autoHibernateCandidates, touchActivity } from "./autoHibernate";
import type { Workspace } from "./types";
import { activityStamps, saveWorkspaceState } from "./workspaceState";

const CHECK_EVERY_MS = 60_000;

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
    const now = Date.now();
    if (previous) activityStamps.set(previous, now);
    if (deps.activeWorkspaceId) activityStamps.set(deps.activeWorkspaceId, now);
  }, [deps.activeWorkspaceId]);

  useEffect(() => {
    let running = false;
    const tick = async () => {
      const { workspacesRef, activeWorkspaceIdRef, requestAutoHibernate } = depsRef.current;
      const now = Date.now();
      touchActivity(activityStamps, workspacesRef.current, activeWorkspaceIdRef.current, now);
      saveWorkspaceState(
        workspacesRef.current,
        workspacesRef.current.findIndex((w) => w.id === activeWorkspaceIdRef.current),
      );
      if (running) return;
      running = true;
      try {
        const due = autoHibernateCandidates(
          workspacesRef.current,
          activeWorkspaceIdRef.current,
          activityStamps,
          mode,
          now,
        );
        for (const id of due) await requestAutoHibernate(id);
      } finally {
        running = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [mode]);
}
