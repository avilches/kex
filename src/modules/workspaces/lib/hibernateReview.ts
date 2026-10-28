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

// A working agent: the only busy terminal worth a question.
export type BusyRow = { tabId: string; kind: "agent"; name: string; agent: string };
export type DocRow = { tabId: string; title: string | undefined; path: string };
export type HibernateReview = { busy: BusyRow[]; docs: DocRow[] };

// Only a working agent and an unsaved document are worth a question: a running process or script
// is stopped without asking, since the Restore Command brings it back.
export function needsConfirmation(r: HibernateReview): boolean {
  return r.docs.length > 0 || r.busy.some((b) => b.kind === "agent");
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
  return r.busy.length === 0 && r.docs.length === 0;
}

// Tab id to the label of the foreground process the PTY reports for it. Only the unattended
// hibernation asks for it: it must not stop a process nobody chose to stop.
export type ForegroundProcesses = ReadonlyMap<string, string>;

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
    });
  }
}

// An unattended hibernation must not take a terminal whose command would not come back on wake:
// an agent with no stored session and no saved command, or a process nothing remembers. Mirrors
// what useTerminalSession does on spawn.
export function staysBehind(
  tab: Extract<Tab, { kind: "terminal" }>,
  live: HibernateLive,
  processes: ForegroundProcesses,
): boolean {
  const agent = live.agentOf(tab.id);
  const command = processes.get(tab.id) ?? tab.persistentCommand ?? agent?.agent;
  if (!command) return false;
  return !(agent?.resumable === true || tab.persistentCommand);
}

// What closing a workspace would destroy: working agents and unsaved documents.
export function hibernateReview(ws: Workspace, live: HibernateLive): HibernateReview {
  const review: HibernateReview = { busy: [], docs: [] };
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
  const review: HibernateReview = { busy: [], docs: [] };
  for (const tab of tabs) if (tab.kind === "terminal") reviewTerminal(tab, live, review);
  return review;
}

// Terminals an unattended hibernation must leave alone: a working agent, an agent waiting for the
// user, or a running script.
export function busyTabIds(tabs: readonly Tab[], live: HibernateLive): Set<string> {
  const ids = new Set<string>();
  for (const tab of tabs) {
    if (tab.kind !== "terminal" || tab.hibernation) continue;
    const status = live.agentOf(tab.id)?.status;
    const script = live.actionOf(tab.id) && live.scriptState(tab.id);
    if (status === "working" || status === "attention" || script) ids.add(tab.id);
  }
  return ids;
}
