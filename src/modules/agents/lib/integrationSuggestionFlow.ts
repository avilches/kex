import { isAgentId, type SuggestionMap, shouldSuggest, withAsked, withInstalled } from "./integrationSuggestion";
import type { AgentId, IntegrationStatus } from "./integrations";

export type SuggestDeps = {
  now: () => number;
  status: (agent: AgentId) => Promise<IntegrationStatus>;
  read: () => Promise<SuggestionMap>;
  update: (change: (map: SuggestionMap) => SuggestionMap) => Promise<void>;
  show: (agent: AgentId) => void;
  warn: (tabId: string, agent: AgentId) => void;
};

// Decides whether a detected agent deserves the install suggestion. Each agent is looked at
// once per app run: a second tab starting the same agent never races the first one. The ask is
// counted when the toast shows, whatever the user does with it, because closing it unanswered
// is the same "not now" as pressing the button.
export function createIntegrationSuggester(deps: SuggestDeps) {
  const seen = new Set<AgentId>();
  return async (agent: unknown, tabId: string): Promise<void> => {
    if (!isAgentId(agent)) return;
    const first = !seen.has(agent);
    seen.add(agent);
    try {
      const status = await deps.status(agent);
      if (status === "installed") {
        // Installed before this feature existed: it counts as installed once, so a later
        // uninstall does not bring the suggestion back.
        if (first) await deps.update((map) => withInstalled(map, agent));
        return;
      }
      // Install would fail anyway; the ask is kept for a later run where it can work.
      if (status !== "missing") return;
      const map = await deps.read();
      // The tab marker does not depend on the ask policy: every tab running the agent shows
      // it until the user dismisses it for good.
      if (!map[agent]?.markerDismissed) deps.warn(tabId, agent);
      if (!first) return;
      if (!shouldSuggest(map[agent], deps.now())) return;
      await deps.update((current) => withAsked(current, agent, deps.now()));
      deps.show(agent);
    } catch (e) {
      console.error("[kex] integration suggestion failed:", e);
    }
  };
}
