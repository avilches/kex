import type { AgentStatus } from "@/modules/agents/lib/types";
import { isRunningAgentSession } from "@/modules/agents/lib/sessionEndPolicy";
import { hasResumed } from "@/modules/agents/lib/restoreCheck";
import { allPanes } from "./splitNode";
import type { ScriptState } from "./terminalEphemeralStore";
import type { Tab, Workspace } from "./types";

export type HibernateLive = {
  agentOf: (tabId: string) => { agent: string; status: AgentStatus; resumable: boolean } | undefined;
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
};
export type DocRow = { tabId: string; title: string | undefined; path: string };
// A plain terminal with a command running in the foreground. An agent is never one: it is either
// busy or has nothing to lose.
export type ProcessRow = { tabId: string; title: string | undefined; command: string };
export type HibernateReview = { busy: BusyRow[]; docs: DocRow[]; processes: ProcessRow[] };

// A busy agent and unsaved documents are always asked about. A running process or script is only
// asked about while the user keeps that warning on.
export function needsConfirmation(r: HibernateReview, warnProcesses: boolean): boolean {
  if (r.docs.length > 0 || r.busy.some((b) => b.kind === "agent")) return true;
  return warnProcesses && (r.busy.length > 0 || r.processes.length > 0);
}

// The confirmation can be silenced with "Don't ask me again" only when no agent or document is in it.
export function canSilenceWarning(r: HibernateReview): boolean {
  return r.docs.length === 0 && !r.busy.some((b) => b.kind === "agent");
}

// A document whose save failed must be fixed in its tab or, only when closing, explicitly discarded.
export function isBlockedByFailures(
  docs: readonly DocRow[],
  failures: Readonly<Record<string, string>>,
  discarded: ReadonlySet<string>,
): boolean {
  return docs.some((d) => failures[d.tabId] !== undefined && !discarded.has(d.tabId));
}

export function isReviewEmpty(r: HibernateReview): boolean {
  return r.busy.length === 0 && r.docs.length === 0 && r.processes.length === 0;
}

// Tab id to the label of the foreground process the PTY reports for it.
export type ForegroundProcesses = ReadonlyMap<string, string>;

function reviewTerminal(
  tab: Extract<Tab, { kind: "terminal" }>,
  live: HibernateLive,
  processes: ForegroundProcesses,
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
    });
    return;
  }
  const script = live.actionOf(tab.id);
  const state = script ? live.scriptState(tab.id) : undefined;
  if (script && state) {
    review.busy.push({
      tabId: tab.id,
      kind: "script",
      name: script.name.trim() || script.command.trim(),
      command: script.command.trim() || undefined,
      stopping: state === "waiting",
    });
    return;
  }
  // An idle agent keeps its process in the foreground but has nothing to lose.
  if (agent) return;
  const command = processes.get(tab.id);
  if (command) review.processes.push({ tabId: tab.id, title: tab.title, command });
}

// An unattended hibernation must not take a terminal whose command would not come back on wake:
// with the tab's Run on start explicitly off, or an agent with no stored session and no saved
// command. Mirrors what useTerminalSession does on spawn.
export function staysBehind(
  tab: Extract<Tab, { kind: "terminal" }>,
  live: HibernateLive,
  processes: ForegroundProcesses,
): boolean {
  const agent = live.agentOf(tab.id);
  const command = processes.get(tab.id) ?? tab.persistentCommand ?? agent?.agent;
  if (!command) return false;
  if (tab.restoreOnRestart === false) return true;
  return !(agent?.resumable === true || tab.persistentCommand);
}

// What closing a workspace would destroy: busy terminals, unsaved documents and running processes.
export function hibernateReview(ws: Workspace, live: HibernateLive, processes: ForegroundProcesses = new Map()): HibernateReview {
  const review: HibernateReview = { busy: [], docs: [], processes: [] };
  for (const tab of allPanes(ws.paneTree).flatMap((p) => p.tabs)) {
    if (tab.kind === "editor" || tab.kind === "markdown") {
      if (tab.dirty) review.docs.push({ tabId: tab.id, title: tab.title, path: tab.path });
    } else if (tab.kind === "terminal") {
      reviewTerminal(tab, live, processes, review);
    }
  }
  return review;
}

// What putting these tabs to sleep would lose. Only terminals sleep, so there are no documents.
export function tabsReview(tabs: readonly Tab[], live: HibernateLive, processes: ForegroundProcesses = new Map()): HibernateReview {
  const review: HibernateReview = { busy: [], docs: [], processes: [] };
  for (const tab of tabs) if (tab.kind === "terminal") reviewTerminal(tab, live, processes, review);
  return review;
}

// Terminals an unattended hibernation must leave alone: a working agent, a running script, or
// an agent waiting for the user.
export function busyTabIds(tabs: readonly Tab[], live: HibernateLive): Set<string> {
  const ids = new Set(tabsReview(tabs, live).busy.map((b) => b.tabId));
  for (const tab of tabs) if (tab.kind === "terminal" && live.agentOf(tab.id)?.status === "attention") ids.add(tab.id);
  return ids;
}
