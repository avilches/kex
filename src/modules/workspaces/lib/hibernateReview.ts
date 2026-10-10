import type { AgentStatus } from "@/modules/agents/lib/types";
import { hasResumed } from "@/modules/agents/lib/restoreCheck";
import { allPanes } from "./splitNode";
import type { Tab, Workspace } from "./types";

export type HibernateLive = {
  agentOf: (tabId: string) => { agent: string; status: AgentStatus; resumable: boolean } | undefined;
  runningCommand: (tabId: string) => string | undefined;
};

export function liveAgent(
  session: { agent: string; status: AgentStatus; meta?: { sessionId?: string } } | undefined,
): ReturnType<HibernateLive["agentOf"]> {
  return session && { agent: session.agent, status: session.status, resumable: hasResumed(session) };
}

export type AgentRow = { tabId: string; title: string | undefined; agent: string };
export type DocRow = { tabId: string; title: string | undefined; path: string };
export type CommandRow = { tabId: string; title: string | undefined; command: string };
export type HibernateReview = { agents: AgentRow[]; docs: DocRow[]; commands: CommandRow[] };

export function isReviewEmpty(r: HibernateReview): boolean {
  return r.agents.length === 0 && r.docs.length === 0 && r.commands.length === 0;
}

// Mirrors what useTerminalSession does on spawn: with restoreOnRestart not
// explicitly off, an agent with a stored session resumes and a plain terminal
// replays its persistentCommand. Anything else comes back as an empty shell.
function comesBack(tab: Extract<Tab, { kind: "terminal" }>, isAgent: boolean): boolean {
  if (tab.restoreOnRestart === false) return false;
  return isAgent || !!tab.persistentCommand;
}

export function hibernateReview(ws: Workspace, live: HibernateLive): HibernateReview {
  const scriptTabs = new Set((ws.scripts ?? []).map((s) => s.tabId).filter((id): id is string => !!id));
  const review: HibernateReview = { agents: [], docs: [], commands: [] };

  for (const tab of allPanes(ws.paneTree).flatMap((p) => p.tabs)) {
    if (tab.kind === "editor" || tab.kind === "markdown") {
      if (tab.dirty) review.docs.push({ tabId: tab.id, title: tab.title, path: tab.path });
      continue;
    }
    if (tab.kind !== "terminal") continue;

    const agent = live.agentOf(tab.id);
    if (agent?.status === "working") {
      review.agents.push({ tabId: tab.id, title: tab.title, agent: agent.agent });
      continue;
    }
    if (scriptTabs.has(tab.id)) continue;
    if (comesBack(tab, agent?.resumable === true)) continue;
    const command = live.runningCommand(tab.id) ?? tab.persistentCommand ?? agent?.agent;
    if (!command) continue;
    review.commands.push({ tabId: tab.id, title: tab.title, command });
  }
  return review;
}
