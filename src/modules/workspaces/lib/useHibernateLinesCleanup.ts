import { useEffect, useRef } from "react";
import { departedHibernatedIds, hibernatedTabIds } from "./hibernate";
import { deleteHibernateLines } from "./hibernateLinesIo";
import type { Workspace } from "./types";

// One place for every way a tab stops sleeping (wake, close tab, close workspace, reopen), so none
// of them can leave its stored lines behind. The first render only records the starting point:
// files of tabs that vanished while Kex was closed are swept by the backend at startup.
export function useHibernateLinesCleanup(workspaces: readonly Workspace[]): void {
  const previous = useRef<Set<string> | null>(null);
  useEffect(() => {
    const now = hibernatedTabIds(workspaces);
    const before = previous.current;
    previous.current = now;
    if (!before) return;
    const gone = departedHibernatedIds(before, now);
    if (gone.length > 0) {
      deleteHibernateLines(gone).catch((e) => console.warn("[kex] could not delete hibernate lines:", e));
    }
  }, [workspaces]);
}
