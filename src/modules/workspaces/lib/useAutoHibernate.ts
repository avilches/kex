import { useEffect, useRef } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { autoHibernateCandidates, touchActivity } from "./autoHibernate";
import type { Workspace } from "./types";

const CHECK_EVERY_MS = 60_000;

type Deps = {
  workspacesRef: { current: Workspace[] };
  activeWorkspaceIdRef: { current: string | null };
  requestAutoHibernate: (workspaceId: string) => Promise<boolean>;
};

export function useAutoHibernate(deps: Deps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const mode = usePreferencesStore((s) => s.autoHibernate);

  useEffect(() => {
    const seen = new Map<string, number>();
    let running = false;
    const tick = async () => {
      const { workspacesRef, activeWorkspaceIdRef, requestAutoHibernate } = depsRef.current;
      const now = Date.now();
      touchActivity(seen, workspacesRef.current, activeWorkspaceIdRef.current, now);
      if (running) return;
      running = true;
      try {
        const due = autoHibernateCandidates(
          workspacesRef.current,
          activeWorkspaceIdRef.current,
          seen,
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
