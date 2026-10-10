import type {
  AgentEntry,
  AgentEntryVisual,
} from "@/modules/agents/lib/notificationList";

export const TERMINAL_DETAIL_MODES = [
  "all",
  "agents",
  "active-agents",
] as const;

export type TerminalDetail = (typeof TERMINAL_DETAIL_MODES)[number];

export const TERMINAL_DETAIL_LABELS: Record<TerminalDetail, string> = {
  all: "All terminals",
  agents: "Only agents",
  "active-agents": "Only active agents",
};

export type DetailFilter = {
  terminals: TerminalDetail | "none";
  editors: boolean;
  browsers: boolean;
  git: boolean;
};

export type DetailTab = { id: string; kind: string };

export type DetailRow = { tabId: string; visual: AgentEntryVisual | null };

export function hasDetail(f: DetailFilter): boolean {
  return f.terminals !== "none" || f.editors || f.browsers || f.git;
}

export function isTerminalDetail(v: unknown): v is TerminalDetail {
  return TERMINAL_DETAIL_MODES.includes(v as TerminalDetail);
}

function includesKind(kind: string, f: DetailFilter): boolean {
  switch (kind) {
    case "editor":
    case "markdown":
      return f.editors;
    case "browser":
      return f.browsers;
    case "git-diff":
    case "git-history":
    case "git-commit-file":
      return f.git;
    default:
      return false;
  }
}

/**
 * The nested rows under a workspace, in tab order. With `active-agents` the
 * agents come first in the urgency order of `entries`, then the other included
 * tabs. A row carries a visual only when its agent is active (idle agents and
 * non-terminal tabs have none).
 */
export function workspaceDetailRows(
  tabs: DetailTab[],
  agentTabIds: ReadonlySet<string>,
  entries: AgentEntry[],
  filter: DetailFilter,
): DetailRow[] {
  const visualByTab = new Map<string, AgentEntryVisual>();
  for (const e of entries) visualByTab.set(e.tabId, e.visual);
  const row = (id: string): DetailRow => ({
    tabId: id,
    visual: visualByTab.get(id) ?? null,
  });

  const terminalOnly = (t: DetailTab) => t.kind === "terminal";
  const wanted = (t: DetailTab): boolean => {
    if (t.kind !== "terminal") return includesKind(t.kind, filter);
    if (filter.terminals === "all") return true;
    if (filter.terminals === "agents") return agentTabIds.has(t.id);
    return false;
  };

  if (filter.terminals !== "active-agents") {
    return tabs.filter(wanted).map((t) => row(t.id));
  }

  const present = new Set(tabs.filter(terminalOnly).map((t) => t.id));
  const agents = entries.filter((e) => present.has(e.tabId)).map((e) => row(e.tabId));
  const others = tabs.filter((t) => !terminalOnly(t) && wanted(t)).map((t) => row(t.id));
  return [...agents, ...others];
}

export function activeAgentCount(entries: AgentEntry[] | undefined): number {
  return entries?.length ?? 0;
}
