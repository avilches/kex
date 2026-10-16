import { useSyncExternalStore } from "react";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import type { AgentSession } from "@/modules/agents/lib/types";
import {
  subscribe as subscribeOscTitles,
  getOscTitle,
} from "@/modules/terminal/lib/oscTitleStore";
import { useDirGit } from "./dirGitStore";
import { defaultKindFor, type TitleDefaults } from "./defaultTitles";
import { tabTitle } from "./tabTitle";
import { useSystemInfo } from "./systemInfoStore";
import { useTitleDefaults } from "./titleDefaultsPrefs";
import { titleVariablesUsed } from "./titleTemplate";
import { useTitleDraft, withTitleDraft } from "./titleDraftStore";
import { tabDir, type TitleSources } from "./titleVars";
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

export function useAgentTabTitle(savedTab: Tab | null): AgentTabTitleInfo | null {
  // While its rename field is open the tab shows what is being typed.
  const draft = useTitleDraft(savedTab?.id);
  const tab = savedTab && withTitleDraft(savedTab, draft);
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

// The template that titles a tab right now: its own, else the default of its kind.
function effectiveTabTemplate(tab: Tab, hasAgent: boolean, defaults: TitleDefaults): string {
  return tab.title || defaults[defaultKindFor(tab, hasAgent)];
}

export function templateNeedsGit(template: string): boolean {
  const used = titleVariablesUsed(template);
  return used.has("branch") || used.has("repo");
}

// Git is queried only for a tab whose effective title asks for the branch or repo.
export function useTitleSources(
  tab: Tab | null,
  agentSession: AgentSession | undefined,
): TitleSources {
  const sys = useSystemInfo();
  const defaults = useTitleDefaults();
  const hasAgent = !!agentSession && tab?.kind === "terminal";
  // A custom title that expands to nothing falls back to the default, so both count.
  const needsGit =
    !!tab &&
    (templateNeedsGit(effectiveTabTemplate(tab, hasAgent, defaults)) ||
      templateNeedsGit(defaults[defaultKindFor(tab, hasAgent)]));
  const git = useDirGit(needsGit && tab ? tabDir(tab) : undefined, tab?.id);
  return { git, agent: agentSession?.agent, home: sys.home, host: sys.host, defaults };
}

export function resolveAgentTabTitle(
  tab: Tab,
  runningCommand: string | null | undefined,
  oscTitle: string | undefined,
  agentSession: AgentSession | undefined,
  sources?: TitleSources,
): AgentTabTitleInfo {
  const hasAgent = !!agentSession && tab.kind === "terminal";
  // A sleeping tab has no process left to feed its template, so it keeps the name it had.
  const frozen = tab.kind === "terminal" ? tab.hibernation?.title : undefined;
  if (frozen !== undefined) {
    return { displayTitle: frozen, isDescription: true, hasAgent, isRunning: false, agentSession };
  }
  const sessionTitle = agentSession?.meta?.sessionTitle;
  // After a wake or an app-restart restore the live OSC title is gone (the PTY was
  // disposed) until the agent boots and sends a new one; the title it last sent is
  // persisted on the tab, so the tab keeps its name through that window.
  const osc = oscTitle ?? (tab.kind === "terminal" ? tab.agentTitle : undefined);
  // The agent name only reaches the sources of an agent tab, which is what selects its default.
  const src = {
    ...sources,
    agent: hasAgent ? (sources?.agent ?? agentSession?.agent) : undefined,
    session: sessionTitle,
  };
  const displayTitle = tabTitle(tab, runningCommand, osc, src);
  const isDescription = !!(tab.title || osc || sessionTitle);

  return { displayTitle, isDescription, hasAgent, isRunning: !!runningCommand, agentSession };
}
