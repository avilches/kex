import { useAgentStore } from "@/modules/agents/store/agentStore";
import { getOscTitle, subscribe as subscribeOscTitles } from "@/modules/terminal/lib/oscTitleStore";

export const AGENT_TITLE_SAVE_MS = 10_000;

type Coalescer = {
  push: (tabId: string, title: string) => void;
  flush: () => boolean;
  dispose: () => void;
};

// One shared window for every tab: a change flushes right away when the last flush is older
// than `intervalMs`, otherwise it waits for the rest of the window, and all the titles that
// changed meanwhile go out together. A burst from ten tabs costs one save, not ten.
export function createTitleCoalescer(
  apply: (titles: Map<string, string>) => void,
  intervalMs: number = AGENT_TITLE_SAVE_MS,
): Coalescer {
  let pending = new Map<string, string>();
  let lastFlush = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (pending.size === 0) return false;
    const batch = pending;
    pending = new Map();
    lastFlush = Date.now();
    apply(batch);
    return true;
  };

  return {
    push(tabId, title) {
      pending.set(tabId, title);
      const wait = lastFlush + intervalMs - Date.now();
      if (wait <= 0) flush();
      else if (timer === null) timer = setTimeout(flush, wait);
    },
    flush,
    dispose() {
      flush();
    },
  };
}

let active: Coalescer | null = null;

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
