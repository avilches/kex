import type { AgentStatus } from "@/modules/agents/lib/types";
import { isRunningAgentSession } from "@/modules/agents/lib/sessionEndPolicy";
import { hasResumed } from "@/modules/agents/lib/restoreCheck";
import { allPanes } from "./splitNode";
import type { ScriptState } from "./terminalEphemeralStore";
import type { Tab, Workspace } from "./types";

export type HibernateLive = {
  agentOf: (tabId: string) => { agent: string; status: AgentStatus; resumable: boolean } | undefined;
  runningCommand: (tabId: string) => string | undefined;
  scriptState: (tabId: string) => ScriptState | undefined;
  /** The script Action whose last run was in this tab, if any. */
  actionOf: (tabId: string) => { name: string; command: string } | undefined;
};

export function liveAgent(
  session: { agent: string; status: AgentStatus; meta?: { sessionId?: string }; restoreError: boolean } | undefined,
): ReturnType<HibernateLive["agentOf"]> {
  // A failed restore leaves a placeholder "working" session with no process behind it.
  if (!session || !isRunningAgentSession(session)) return undefined;
  return { agent: session.agent, status: session.status, resumable: hasResumed(session) };
}

export type BusyRow = {
  tabId: string;
  kind: "agent" | "script";
  name: string;
  command?: string;
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

function reviewTerminal(
  tab: Extract<Tab, { kind: "terminal" }>,
  live: HibernateLive,
  review: HibernateReview,
): void {
  if (tab.hibernation) return;
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
    return;
  }
  const script = live.actionOf(tab.id);
  if (script) {
    const state = live.scriptState(tab.id);
    if (state) {
      review.busy.push({
        tabId: tab.id,
        kind: "script",
        name: script.name.trim() || script.command.trim(),
        command: script.command.trim() || undefined,
        stopping: state === "waiting",
        runOnStart: false,
      });
    }
    return;
  }
  if (comesBack(tab, agent?.resumable === true)) return;
  const command = live.runningCommand(tab.id) ?? tab.persistentCommand ?? agent?.agent;
  if (!command) return;
  review.commands.push({ tabId: tab.id, title: tab.title, command });
}

// What closing a workspace would destroy: busy terminals, unsaved documents and commands that
// would not come back.
export function hibernateReview(ws: Workspace, live: HibernateLive): HibernateReview {
  const review: HibernateReview = { busy: [], docs: [], commands: [] };
  for (const tab of allPanes(ws.paneTree).flatMap((p) => p.tabs)) {
    if (tab.kind === "editor" || tab.kind === "markdown") {
      if (tab.dirty) review.docs.push({ tabId: tab.id, title: tab.title, path: tab.path });
    } else if (tab.kind === "terminal") {
      reviewTerminal(tab, live, review);
    }
  }
  return review;
}

// What putting these tabs to sleep would lose. Only terminals sleep, so there are no documents.
export function tabsReview(tabs: readonly Tab[], live: HibernateLive): HibernateReview {
  const review: HibernateReview = { busy: [], docs: [], commands: [] };
  for (const tab of tabs) if (tab.kind === "terminal") reviewTerminal(tab, live, review);
  return review;
}

// Terminals an unattended hibernation must leave alone: a working agent, a running script, or
// an agent waiting for the user.
export function busyTabIds(tabs: readonly Tab[], live: HibernateLive): Set<string> {
  const ids = new Set(tabsReview(tabs, live).busy.map((b) => b.tabId));
  for (const tab of tabs) if (tab.kind === "terminal" && live.agentOf(tab.id)?.status === "attention") ids.add(tab.id);
  return ids;
}
