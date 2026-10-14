import { getDirGit } from "./dirGitStore";
import { getSystemInfo } from "./systemInfoStore";
import { getRunningCommand } from "./terminalEphemeralStore";
import { expandTabTitle, tabDir } from "./titleVars";
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
  });
}
