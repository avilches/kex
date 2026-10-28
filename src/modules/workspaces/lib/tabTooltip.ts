import type { AgentSession } from "@/modules/agents/lib/types";
import { tabWorktree } from "./hibernate";
import type { Tab } from "./types";

export function tabTooltipDir(tab: Tab, agentSession: AgentSession | undefined): string | undefined {
  if (tab.kind !== "terminal") return undefined;
  return tabWorktree(tab, agentSession?.meta?.worktreeCwd) || tab.cwd || undefined;
}

export function formatTabTooltip(dir: string | undefined, branch: string | null | undefined): string | undefined {
  if (!dir) return undefined;
  return branch ? `${dir} • ${branch}` : dir;
}
