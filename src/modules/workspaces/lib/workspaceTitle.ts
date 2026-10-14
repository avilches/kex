import { useSyncExternalStore } from "react";
import type { AgentSession } from "@/modules/agents/lib/types";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { getOscTitle, subscribe as subscribeOscTitles } from "@/modules/terminal/lib/oscTitleStore";
import { getDirGit, useDirGit, type DirGit } from "./dirGitStore";
import { getSystemInfo, useSystemInfo, type SystemInfo } from "./systemInfoStore";
import { getRunningCommand, subscribeToRunningCommands } from "./terminalEphemeralStore";
import { hasTitleVariables, titleVariablesUsed } from "./titleTemplate";
import { expandWorkspaceTitle, workspaceDir, type TitleSources } from "./titleVars";
import { resolveAgentTabTitle } from "./useAgentTabTitle";
import type { Tab } from "./types";

// What a workspace title needs: it has no location of its own, so the tab the user is
// focused on (active pane's active tab) lends it one.
export type WorkspaceTitleSubject = {
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
};

export function resolveWorkspaceTitle(ws: WorkspaceTitleSubject, inp: Inputs): string {
  if (!hasTitleVariables(ws.title)) return ws.title;
  const src: TitleSources = {
    git: inp.git,
    agent: inp.agentSession?.agent,
    home: inp.sys.home,
    host: inp.sys.host,
  };
  const focusedTitle = ws.focusedTab
    ? resolveAgentTabTitle(ws.focusedTab, inp.runningCommand, inp.oscTitle, inp.agentSession, src)
        .displayTitle
    : "";
  return expandWorkspaceTitle(ws, ws.focusedTab, focusedTitle, {
    ...src,
    runningCommand: inp.runningCommand,
  });
}

function gitDirFor(ws: WorkspaceTitleSubject): string | undefined {
  if (!hasTitleVariables(ws.title)) return undefined;
  const used = titleVariablesUsed(ws.title);
  const tabTitleNeedsGit = used.has("tab") && !!ws.focusedTab?.title && hasTitleVariables(ws.focusedTab.title);
  const needsGit = used.has("branch") || used.has("repo") || tabTitleNeedsGit;
  return needsGit ? workspaceDir(ws, ws.focusedTab) : undefined;
}

// Reactive: re-renders when the focused tab's command, OSC title, agent or branch change.
export function useWorkspaceTitle(ws: WorkspaceTitleSubject): string {
  const tab = ws.focusedTab;
  const runningCommand = useSyncExternalStore(subscribeToRunningCommands, () =>
    tab?.kind === "terminal" ? getRunningCommand(tab.id) : null,
  );
  const oscTitle = useSyncExternalStore(subscribeOscTitles, () =>
    tab?.kind === "terminal" ? getOscTitle(tab.id) : undefined,
  );
  const agentSession = useAgentStore((s) => (tab ? s.sessions[tab.id] : undefined));
  const sys = useSystemInfo();
  const git = useDirGit(gitDirFor(ws));
  return resolveWorkspaceTitle(ws, { runningCommand, oscTitle, agentSession, sys, git });
}

// One-shot read of the same stores, for lists that rebuild on their own schedule.
export function workspaceTitleNow(ws: WorkspaceTitleSubject): string {
  const tab = ws.focusedTab;
  return resolveWorkspaceTitle(ws, {
    runningCommand: tab?.kind === "terminal" ? getRunningCommand(tab.id) : null,
    oscTitle: tab?.kind === "terminal" ? getOscTitle(tab.id) : undefined,
    agentSession: tab ? useAgentStore.getState().sessions[tab.id] : undefined,
    sys: getSystemInfo(),
    git: getDirGit(gitDirFor(ws)),
  });
}
