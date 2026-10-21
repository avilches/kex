import { createCoalescer, type Coalescer } from "./coalescer";
import { isHibernating } from "@/modules/agents/lib/hibernatingTabs";
import { restorePlansReady, restoreSnapshotTabIds } from "@/modules/agents/lib/agentSessionRestore";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { getOscTitle, subscribe as subscribeOscTitles } from "@/modules/terminal/lib/oscTitleStore";

export const AGENT_TITLE_SAVE_MS = 10_000;

export function createTitleCoalescer(
  apply: (titles: Map<string, string>) => void,
  intervalMs: number = AGENT_TITLE_SAVE_MS,
): Coalescer<string, string> {
  return createCoalescer<string, string>(apply, intervalMs);
}

let active: Coalescer<string, string> | null = null;

// Saves the pending titles now (hibernation, window close). Resolves after a beat so the state
// the flush just set reaches the debounced workspace save before the caller flushes that.
export async function flushAgentTitles(): Promise<void> {
  if (active?.flush()) await new Promise((r) => setTimeout(r, 50));
}

// What the agent sent for a tab: the OSC title, else the session title its hooks report.
function agentTitleOf(tabId: string): string | undefined {
  const session = useAgentStore.getState().sessions[tabId];
  if (!session) return undefined;
  return getOscTitle(tabId) || session.meta?.sessionTitle || undefined;
}

// Persisted titles only track what an agent sent while its session was on the tab, so a
// sessionless OSC title (a shell program naming its own window) is never the sync's business.
export function startAgentTitleSync(
  apply: (titles: Map<string, string>) => void,
  revoke?: (tabIds: ReadonlySet<string>) => void,
): () => void {
  const coalescer = createTitleCoalescer(apply);
  active = coalescer;
  const seen = new Map<string, string>();
  // Tabs whose persisted title ever came from an agent session: the moment the session dies,
  // the title must go too, or the tab keeps the agent name after the agent is gone (pi and omp
  // leave their title as the last thing the terminal shows; claude and opencode rewrite theirs).
  const fromAgent = new Set<string>();
  // The restore plans arrive async at launch. Until they do the shield is empty, and a scan
  // would revoke titles that a pending restore still claims: revocation waits for them.
  let plansReady = false;
  let stopped = false;
  void restorePlansReady().then(() => {
    if (stopped) return;
    plansReady = true;
    // The load may have completed without a store or title change having scanned since.
    scan();
  });

  const scan = () => {
    const sessions = useAgentStore.getState().sessions;
    if (revoke && plansReady) {
      const dead = new Set<string>();
      for (const id of fromAgent) {
        if (sessions[id]) continue;
        // While hibernating (the wake restores from this session) or waiting on a restore plan
        // or staged snapshot, the title is still claimed by the agent to come back.
        if (isHibernating(id) || restoreSnapshotTabIds().has(id)) continue;
        dead.add(id);
      }
      if (dead.size > 0) {
        for (const id of dead) {
          fromAgent.delete(id);
          seen.delete(id);
          // A title pushed right before the session vanished must not save itself afterwards.
          coalescer.drop(id);
        }
        revoke(dead);
      }
    }
    for (const id of seen.keys()) if (!sessions[id]) seen.delete(id);
    for (const id of Object.keys(sessions)) {
      fromAgent.add(id);
      const title = agentTitleOf(id);
      if (title === undefined || seen.get(id) === title) continue;
      seen.set(id, title);
      coalescer.push(id, title);
    }
  };

  const unsubStore = useAgentStore.subscribe((state, prev) => {
    if (state.sessions !== prev.sessions) scan();
  });
  const unsubTitles = subscribeOscTitles(scan);
  const localWindow = typeof window !== "undefined" ? window : null;
  localWindow?.addEventListener("beforeunload", coalescer.flush);
  scan();

  return () => {
    stopped = true;
    unsubStore();
    unsubTitles();
    localWindow?.removeEventListener("beforeunload", coalescer.flush);
    coalescer.dispose();
    if (active === coalescer) active = null;
  };
}
