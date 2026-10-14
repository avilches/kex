import type { AgentSession } from "@/modules/agents/lib/types";
import type { Tab } from "./types";

export function agentRestoreDisabled(tab: Tab): boolean {
  return tab.kind === "terminal" && tab.restoreOnRestart === false;
}

export type AgentIconMark = "restore-off" | "launch-unknown" | null;

// Run on start off wins: it says the tab will not be relaunched at all, which is stronger than
// being relaunched with the agent's plain command.
export function agentIconMark(
  tab: Tab,
  session: Pick<AgentSession, "meta"> | undefined,
): AgentIconMark {
  if (agentRestoreDisabled(tab)) return "restore-off";
  return session?.meta?.launchKnown === false ? "launch-unknown" : null;
}
