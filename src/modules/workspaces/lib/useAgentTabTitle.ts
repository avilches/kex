import { useSyncExternalStore } from "react";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import type { AgentSession } from "@/modules/agents/lib/types";
import {
  subscribe as subscribeOscTitles,
  getSnapshot as getOscTitlesSnapshot,
} from "@/modules/terminal/lib/oscTitleStore";
import { agentAwareTabTitle, tabTitle } from "./tabTitle";
import {
  getRunningCommandsSnapshot,
  subscribeToRunningCommands,
} from "./terminalEphemeralStore";
import type { Tab } from "./types";

export type AgentTabTitleInfo = {
  displayTitle: string;
  isDescription: boolean;
  hasAgent: boolean;
  agentSession: AgentSession | undefined;
};

export function useAgentTabTitle(tab: Tab | null): AgentTabTitleInfo | null {
  const runningCommandMap = useSyncExternalStore(
    subscribeToRunningCommands,
    getRunningCommandsSnapshot,
  );
  const oscTitleMap = useSyncExternalStore(subscribeOscTitles, getOscTitlesSnapshot);
  const agentSession = useAgentStore((s) => (tab ? s.sessions[tab.id] : undefined));

  if (!tab) return null;

  const runningCommand = tab.kind === "terminal" ? (runningCommandMap.get(tab.id) ?? null) : null;
  const oscTitle = tab.kind === "terminal" ? oscTitleMap.get(tab.id) : undefined;
  const hasAgent = !!agentSession && tab.kind === "terminal";
  const sessionTitle = agentSession?.meta?.sessionTitle;
  const baseTitle = tabTitle(tab, runningCommand, oscTitle);
  const displayTitle = agentAwareTabTitle(
    tab,
    hasAgent,
    agentSession?.agent,
    oscTitle,
    sessionTitle,
    baseTitle,
  );
  const isDescription = !!(tab.title || oscTitle || sessionTitle);

  return { displayTitle, isDescription, hasAgent, agentSession };
}
