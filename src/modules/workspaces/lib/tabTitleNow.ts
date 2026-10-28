import { useAgentStore } from "@/modules/agents/store/agentStore";
import { getOscTitle } from "@/modules/terminal/lib/oscTitleStore";
import { getDirGit } from "./dirGitStore";
import { getSystemInfo } from "./systemInfoStore";
import { getTabWorkspaceRoot } from "./tabWorkspaceRootStore";
import { getRunningCommand, getRunningScriptName } from "./terminalEphemeralStore";
import { titleDefaultsNow } from "./titleDefaultsPrefs";
import { expandTabTitle, tabDir } from "./titleVars";
import { resolveAgentTabTitle } from "./useAgentTabTitle";
import type { Tab } from "./types";

// The user's own title for a tab, expanded from the stores at this instant. For callers
// outside React (notifications); components use useAgentTabTitle.
export function tabTitleNow(tab: Tab): string {
  const sys = getSystemInfo();
  const dir = tabDir(tab);
  return expandTabTitle(tab, {
    runningCommand: tab.kind === "terminal" ? getRunningCommand(tab.id) : null,
    git: getDirGit(dir),
    home: sys.home,
    host: sys.host,
    workspaceRoot: getTabWorkspaceRoot(tab.id),
  });
}

// The title the tab shows, defaults included, read at this instant (drag ghost).
export function tabDisplayTitleNow(tab: Tab): string {
  const sys = getSystemInfo();
  const terminal = tab.kind === "terminal";
  return resolveAgentTabTitle(
    tab,
    terminal ? getRunningCommand(tab.id) : null,
    terminal ? getOscTitle(tab.id) : undefined,
    useAgentStore.getState().sessions[tab.id],
    {
      git: getDirGit(tabDir(tab)),
      home: sys.home,
      host: sys.host,
      defaults: titleDefaultsNow(),
      workspaceRoot: getTabWorkspaceRoot(tab.id),
    },
    terminal ? getRunningScriptName(tab.id) : undefined,
  ).displayTitle;
}
