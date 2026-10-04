import { useSyncExternalStore } from "react";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import type { AgentSession } from "@/modules/agents/lib/types";
import {
  subscribe as subscribeOscTitles,
  getOscTitle,
} from "@/modules/terminal/lib/oscTitleStore";
import { agentAwareTabTitle, tabTitle } from "./tabTitle";
import {
  getRunningCommand,
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
  // Per-tab selectors: only this tab's entry re-renders the component, not
  // every terminal's running command / OSC title change.
  const runningCommand = useSyncExternalStore(
    subscribeToRunningCommands,
    () => (tab?.kind === "terminal" ? getRunningCommand(tab.id) : null),
  );
  const oscTitle = useSyncExternalStore(
    subscribeOscTitles,
    () => (tab?.kind === "terminal" ? getOscTitle(tab.id) : undefined),
  );
  const agentSession = useAgentStore((s) => (tab ? s.sessions[tab.id] : undefined));

  if (!tab) return null;

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
