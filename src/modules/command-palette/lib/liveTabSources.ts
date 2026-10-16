import { buildAgentEntries } from "@/modules/agents/lib/notificationList";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { getDirGit } from "@/modules/workspaces/lib/dirGitStore";
import { getRunningCommand } from "@/modules/workspaces/lib/terminalEphemeralStore";
import { tabDisplayTitleNow } from "@/modules/workspaces/lib/tabTitleNow";
import { tabUseSnapshot } from "@/modules/workspaces/lib/tabUse";
import { activityStamps } from "@/modules/workspaces/lib/workspaceState";
import type { TabSources } from "./tabEntries";

// Reads every store once, at the moment the palette opens. Thin on purpose: the logic is in tabEntries.
export function liveTabSources(): TabSources {
  const use = tabUseSnapshot();
  const agents = useAgentStore.getState();
  const visual = new Map(
    buildAgentEntries(agents.sessions, agents.notifications).map((e) => [e.tabId, e.visual] as const),
  );
  return {
    displayTitle: tabDisplayTitleNow,
    git: getDirGit,
    runningCommand: getRunningCommand,
    agentOf: (id) => agents.sessions[id]?.agent,
    visualOf: (id) => visual.get(id) ?? null,
    lastUsed: (id) => use[id] ?? 0,
    workspaceActiveAt: (id) => activityStamps.get(id) ?? 0,
  };
}
