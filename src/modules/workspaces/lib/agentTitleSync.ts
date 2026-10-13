import { createCoalescer, type Coalescer } from "./coalescer";
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

export function startAgentTitleSync(apply: (titles: Map<string, string>) => void): () => void {
  const coalescer = createTitleCoalescer(apply);
  active = coalescer;
  const seen = new Map<string, string>();

  const scan = () => {
    const sessions = useAgentStore.getState().sessions;
    for (const id of seen.keys()) if (!sessions[id]) seen.delete(id);
    for (const id of Object.keys(sessions)) {
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
  window.addEventListener("beforeunload", coalescer.flush);
  scan();

  return () => {
    unsubStore();
    unsubTitles();
    window.removeEventListener("beforeunload", coalescer.flush);
    coalescer.dispose();
    if (active === coalescer) active = null;
  };
}
