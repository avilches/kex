import { useSyncExternalStore } from "react";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import type { AgentSession } from "@/modules/agents/lib/types";
import {
  subscribe as subscribeOscTitles,
  getOscTitle,
} from "@/modules/terminal/lib/oscTitleStore";
import { useDirGit } from "./dirGitStore";
import { agentAwareTabTitle, tabTitle } from "./tabTitle";
import { useSystemInfo } from "./systemInfoStore";
import { titleVariablesUsed } from "./titleTemplate";
import { expandTabTitle, tabDir, type TitleSources } from "./titleVars";
import {
  getRunningCommand,
  subscribeToRunningCommands,
} from "./terminalEphemeralStore";
import type { Tab } from "./types";

export type AgentTabTitleInfo = {
  displayTitle: string;
  isDescription: boolean;
  hasAgent: boolean;
  isRunning: boolean;
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
  const sources = useTitleSources(tab, agentSession);

  if (!tab) return null;
  return resolveAgentTabTitle(tab, runningCommand, oscTitle, agentSession, sources);
}

// Git is queried only for a tab whose own title asks for the branch or repo.
export function useTitleSources(
  tab: Tab | null,
  agentSession: AgentSession | undefined,
): TitleSources {
  const sys = useSystemInfo();
  const used = tab?.title ? titleVariablesUsed(tab.title) : null;
  const needsGit = !!used && (used.has("branch") || used.has("repo"));
  const git = useDirGit(needsGit && tab ? tabDir(tab) : undefined);
  return { git, agent: agentSession?.agent, home: sys.home, host: sys.host };
}

export function resolveAgentTabTitle(
  tab: Tab,
  runningCommand: string | null | undefined,
  oscTitle: string | undefined,
  agentSession: AgentSession | undefined,
  sources?: TitleSources,
): AgentTabTitleInfo {
  const hasAgent = !!agentSession && tab.kind === "terminal";
  const sessionTitle = agentSession?.meta?.sessionTitle;
  const src = { ...sources, agent: sources?.agent ?? agentSession?.agent };
  const baseTitle = tabTitle(tab, runningCommand, oscTitle, src);
  const customTitle = expandTabTitle(tab, { ...src, runningCommand });
  const displayTitle = agentAwareTabTitle(
    tab,
    hasAgent,
    agentSession?.agent,
    oscTitle,
    sessionTitle,
    baseTitle,
    customTitle,
  );
  const isDescription = !!(tab.title || oscTitle || sessionTitle);

  return { displayTitle, isDescription, hasAgent, isRunning: !!runningCommand, agentSession };
}
