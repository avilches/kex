import { useEffect, useRef } from "react";
import { departedHibernatedIds, hibernatedTabIds, terminalTabs } from "./hibernate";
import { deleteHibernateLines } from "./hibernateLinesIo";
import type { Workspace } from "./types";

// Waking a tab deletes its stored lines. Closing one does not: undoing the close brings it back
// asleep with the same id and it needs them. The ones nobody brings back are swept by the backend
// at startup. The first render only records the starting point.
export function useHibernateLinesCleanup(workspaces: readonly Workspace[]): void {
  const previous = useRef<Set<string> | null>(null);
  useEffect(() => {
    const now = hibernatedTabIds(workspaces);
    const before = previous.current;
    previous.current = now;
    if (!before) return;
    const present = new Set(workspaces.flatMap((ws) => terminalTabs(ws).map((t) => t.id)));
    const gone = departedHibernatedIds(before, now).filter((id) => present.has(id));
    if (gone.length > 0) {
      deleteHibernateLines(gone).catch((e) => console.warn("[kex] could not delete hibernate lines:", e));
    }
  }, [workspaces]);
}
