import { createCoalescer, type Coalescer } from "./coalescer";
import type { ExplorerSnapshot } from "./sidebarSnapshot";

export const SIDEBAR_SNAPSHOT_SAVE_MS = 10_000;

let active: Coalescer<string, ExplorerSnapshot> | null = null;

export function startSidebarSnapshotSync(
  apply: (batch: Map<string, ExplorerSnapshot>) => void,
): () => void {
  const coalescer = createCoalescer(apply, SIDEBAR_SNAPSHOT_SAVE_MS);
  active = coalescer;
  window.addEventListener("beforeunload", coalescer.flush);
  return () => {
    window.removeEventListener("beforeunload", coalescer.flush);
    coalescer.dispose();
    if (active === coalescer) active = null;
  };
}

export function pushSidebarSnapshot(workspaceId: string, snapshot: ExplorerSnapshot): void {
  active?.push(workspaceId, snapshot);
}

export function flushSidebarSnapshotsNow(): boolean {
  return active?.flush() ?? false;
}

// Same beat as flushAgentTitles: lets the state the flush set reach the debounced
// workspace save before the caller flushes that.
export async function flushSidebarSnapshots(): Promise<void> {
  if (flushSidebarSnapshotsNow()) await new Promise((r) => setTimeout(r, 50));
}
