import type { AgentStatus } from "@/modules/agents/lib/types";
import { hasResumed } from "@/modules/agents/lib/restoreCheck";
import { allPanes } from "./splitNode";
import type { ScriptState } from "./terminalEphemeralStore";
import type { Tab, Workspace } from "./types";

export type HibernateLive = {
  agentOf: (tabId: string) => { agent: string; status: AgentStatus; resumable: boolean } | undefined;
  runningCommand: (tabId: string) => string | undefined;
  scriptState: (tabId: string) => ScriptState | undefined;
};

export function liveAgent(
  session: { agent: string; status: AgentStatus; meta?: { sessionId?: string } } | undefined,
): ReturnType<HibernateLive["agentOf"]> {
  return session && { agent: session.agent, status: session.status, resumable: hasResumed(session) };
}

export type BusyRow = {
  tabId: string;
  kind: "agent" | "script";
  name: string;
  agent?: string;
  stopping: boolean;
  runOnStart: boolean;
};
export type DocRow = { tabId: string; title: string | undefined; path: string };
export type CommandRow = { tabId: string; title: string | undefined; command: string };
export type HibernateReview = { busy: BusyRow[]; docs: DocRow[]; commands: CommandRow[] };

// A document whose save failed must be fixed in its tab or, only when closing, explicitly discarded.
export function isBlockedByFailures(
  docs: readonly DocRow[],
  failures: Readonly<Record<string, string>>,
  discarded: ReadonlySet<string>,
): boolean {
  return docs.some((d) => failures[d.tabId] !== undefined && !discarded.has(d.tabId));
}

export function isReviewEmpty(r: HibernateReview): boolean {
  return r.busy.length === 0 && r.docs.length === 0 && r.commands.length === 0;
}

// Mirrors what useTerminalSession does on spawn: with restoreOnRestart not
// explicitly off, an agent with a stored session resumes and a plain terminal
// replays its persistentCommand. Anything else comes back as an empty shell.
function comesBack(tab: Extract<Tab, { kind: "terminal" }>, isAgent: boolean): boolean {
  if (tab.restoreOnRestart === false) return false;
  return isAgent || !!tab.persistentCommand;
}

export function hibernateReview(ws: Workspace, live: HibernateLive): HibernateReview {
  const scriptByTab = new Map((ws.scripts ?? []).flatMap((s) => (s.tabId ? [[s.tabId, s] as const] : [])));
  const review: HibernateReview = { busy: [], docs: [], commands: [] };

  for (const tab of allPanes(ws.paneTree).flatMap((p) => p.tabs)) {
    if (tab.kind === "editor" || tab.kind === "markdown") {
      if (tab.dirty) review.docs.push({ tabId: tab.id, title: tab.title, path: tab.path });
      continue;
    }
    if (tab.kind !== "terminal") continue;

    const agent = live.agentOf(tab.id);
    if (agent?.status === "working") {
      review.busy.push({
        tabId: tab.id,
        kind: "agent",
        name: tab.title ?? agent.agent,
        agent: agent.agent,
        stopping: false,
        runOnStart: !comesBack(tab, agent.resumable),
      });
      continue;
    }
    const script = scriptByTab.get(tab.id);
    if (script) {
      const state = live.scriptState(tab.id);
      if (state) {
        review.busy.push({
          tabId: tab.id,
          kind: "script",
          name: script.name,
          stopping: state === "waiting",
          runOnStart: false,
        });
      }
      continue;
    }
    if (comesBack(tab, agent?.resumable === true)) continue;
    const command = live.runningCommand(tab.id) ?? tab.persistentCommand ?? agent?.agent;
    if (!command) continue;
    review.commands.push({ tabId: tab.id, title: tab.title, command });
  }
  return review;
}
