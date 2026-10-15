import { useSyncExternalStore } from "react";
import type { AgentSession } from "@/modules/agents/lib/types";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { getOscTitle, subscribe as subscribeOscTitles } from "@/modules/terminal/lib/oscTitleStore";
import { defaultKindFor, FALLBACK_TITLES, type TitleDefaults } from "./defaultTitles";
import { getDirGit, useDirGit, type DirGit } from "./dirGitStore";
import { getSystemInfo, useSystemInfo, type SystemInfo } from "./systemInfoStore";
import { getRunningCommand, subscribeToRunningCommands } from "./terminalEphemeralStore";
import { titleDefaultsNow, useTitleDefaults } from "./titleDefaultsPrefs";
import { getTitleDraft, useTitleDraft, withTitleDraft } from "./titleDraftStore";
import { hasTitleVariables, titleVariablesUsed } from "./titleTemplate";
import { expandWorkspaceTitle, workspaceDir, type TitleSources } from "./titleVars";
import { resolveAgentTabTitle, templateNeedsGit } from "./useAgentTabTitle";
import type { Tab } from "./types";

// What a workspace title needs: it has no location of its own, so the tab the user is
// focused on (active pane's active tab) lends it one. An empty title means the
// workspace default template.
export type WorkspaceTitleSubject = {
  // Lets the title being typed in the workspace's rename field show live.
  id?: string;
  title: string;
  cwd?: string;
  workspaceRoot?: string;
  focusedTab: Tab | null;
};

type Inputs = {
  runningCommand: string | null;
  oscTitle: string | undefined;
  agentSession: AgentSession | undefined;
  sys: SystemInfo;
  git: DirGit;
  defaults: TitleDefaults;
};

export function resolveWorkspaceTitle(ws: WorkspaceTitleSubject, inp: Inputs): string {
  const template = ws.title || inp.defaults.workspace;
  if (!hasTitleVariables(template)) return template;
  const src: TitleSources = {
    git: inp.git,
    agent: inp.agentSession?.agent,
    osc: inp.oscTitle,
    session: inp.agentSession?.meta?.sessionTitle,
    home: inp.sys.home,
    host: inp.sys.host,
    defaults: inp.defaults,
  };
  const focusedTitle = ws.focusedTab
    ? resolveAgentTabTitle(ws.focusedTab, inp.runningCommand, inp.oscTitle, inp.agentSession, src)
        .displayTitle
    : "";
  return (
    expandWorkspaceTitle({ ...ws, title: template }, ws.focusedTab, focusedTitle, {
      ...src,
      runningCommand: inp.runningCommand,
    }) || FALLBACK_TITLES.workspace
  );
}

// Templates that could title the focused tab, whose title `{tab}` embeds. Whether it has
// an agent is not known here, so both terminal defaults are considered.
function focusedTabTemplates(tab: Tab, defaults: TitleDefaults): string[] {
  if (tab.title) return [tab.title];
  if (tab.kind === "terminal") return [defaults.terminal, defaults.agent];
  return [defaults[defaultKindFor(tab, false)]];
}

function gitDirFor(ws: WorkspaceTitleSubject, defaults: TitleDefaults): string | undefined {
  const template = ws.title || defaults.workspace;
  if (!hasTitleVariables(template)) return undefined;
  const used = titleVariablesUsed(template);
  const tabNeedsGit =
    used.has("tab") &&
    !!ws.focusedTab &&
    focusedTabTemplates(ws.focusedTab, defaults).some(templateNeedsGit);
  const needsGit = used.has("branch") || used.has("repo") || tabNeedsGit;
  return needsGit ? workspaceDir(ws, ws.focusedTab) : undefined;
}

function withDrafts(
  ws: WorkspaceTitleSubject,
  wsDraft: string | undefined,
  tabDraft: string | undefined,
): WorkspaceTitleSubject {
  return {
    ...ws,
    title: wsDraft ?? ws.title,
    focusedTab: ws.focusedTab && withTitleDraft(ws.focusedTab, tabDraft),
  };
}

// Reactive: re-renders when the focused tab's command, OSC title, agent or branch change.
export function useWorkspaceTitle(saved: WorkspaceTitleSubject): string {
  const ws = withDrafts(saved, useTitleDraft(saved.id), useTitleDraft(saved.focusedTab?.id));
  const tab = ws.focusedTab;
  const runningCommand = useSyncExternalStore(subscribeToRunningCommands, () =>
    tab?.kind === "terminal" ? getRunningCommand(tab.id) : null,
  );
  const oscTitle = useSyncExternalStore(subscribeOscTitles, () =>
    tab?.kind === "terminal" ? getOscTitle(tab.id) : undefined,
  );
  const agentSession = useAgentStore((s) => (tab ? s.sessions[tab.id] : undefined));
  const sys = useSystemInfo();
  const defaults = useTitleDefaults();
  const git = useDirGit(gitDirFor(ws, defaults), tab?.id);
  return resolveWorkspaceTitle(ws, { runningCommand, oscTitle, agentSession, sys, git, defaults });
}

// One-shot read of the same stores, for lists that rebuild on their own schedule.
export function workspaceTitleNow(saved: WorkspaceTitleSubject): string {
  const ws = withDrafts(saved, getTitleDraft(saved.id), getTitleDraft(saved.focusedTab?.id));
  const tab = ws.focusedTab;
  const defaults = titleDefaultsNow();
  return resolveWorkspaceTitle(ws, {
    runningCommand: tab?.kind === "terminal" ? getRunningCommand(tab.id) : null,
    oscTitle: tab?.kind === "terminal" ? getOscTitle(tab.id) : undefined,
    agentSession: tab ? useAgentStore.getState().sessions[tab.id] : undefined,
    sys: getSystemInfo(),
    git: getDirGit(gitDirFor(ws, defaults)),
    defaults,
  });
}
