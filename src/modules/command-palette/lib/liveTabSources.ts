import { buildAgentEntries } from "@/modules/agents/lib/notificationList";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { getDirGit } from "@/modules/workspaces/lib/dirGitStore";
import { focusedTab } from "@/modules/workspaces/lib/splitNode";
import { getRunningCommand } from "@/modules/workspaces/lib/terminalEphemeralStore";
import { tabDisplayTitleNow } from "@/modules/workspaces/lib/tabTitleNow";
import { tabUseSnapshot } from "@/modules/workspaces/lib/tabUse";
import { workspaceTitleNow } from "@/modules/workspaces/lib/workspaceTitle";
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
    // The workspace row must read like the WorkspaceBar: the raw "{host}: {cwd}" template is resolved.
    workspaceTitle: (ws) =>
      workspaceTitleNow({
        id: ws.id,
        title: ws.title,
        cwd: ws.cwd,
        workspaceRoot: ws.workspaceRoot,
        focusedTab: focusedTab(ws.paneTree, ws.activePaneId),
      }),
    git: getDirGit,
    runningCommand: getRunningCommand,
    agentOf: (id) => agents.sessions[id]?.agent,
    agentSessionOf: (id) => agents.sessions[id],
    visualOf: (id) => visual.get(id) ?? null,
    lastUsed: (id) => use[id] ?? 0,
  };
}
