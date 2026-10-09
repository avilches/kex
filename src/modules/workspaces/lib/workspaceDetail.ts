import type {
  AgentEntry,
  AgentEntryVisual,
} from "@/modules/agents/lib/notificationList";

export const WORKSPACE_DETAIL_MODES = [
  "all-tabs",
  "agents",
  "active-agents",
  "none",
] as const;

export type WorkspaceDetailMode = (typeof WORKSPACE_DETAIL_MODES)[number];

export const WORKSPACE_DETAIL_LABELS: Record<WorkspaceDetailMode, string> = {
  "all-tabs": "All tabs",
  agents: "Agents",
  "active-agents": "Active agents",
  none: "None",
};

export type DetailTab = { id: string; kind: string };

export type DetailRow = { tabId: string; visual: AgentEntryVisual | null };

export function isWorkspaceDetailMode(v: unknown): v is WorkspaceDetailMode {
  return WORKSPACE_DETAIL_MODES.includes(v as WorkspaceDetailMode);
}

/**
 * The nested rows under a workspace. `all-tabs` and `agents` keep the tab
 * order; `active-agents` follows the urgency order of `entries`. A row carries
 * a visual only when its agent is active (idle agents have none).
 */
export function workspaceDetailRows(
  tabs: DetailTab[],
  agentTabIds: ReadonlySet<string>,
  entries: AgentEntry[],
  mode: WorkspaceDetailMode,
): DetailRow[] {
  if (mode === "none") return [];

  const visualByTab = new Map<string, AgentEntryVisual>();
  for (const e of entries) visualByTab.set(e.tabId, e.visual);
  const row = (t: DetailTab): DetailRow => ({
    tabId: t.id,
    visual: visualByTab.get(t.id) ?? null,
  });

  if (mode === "all-tabs") return tabs.map(row);
  if (mode === "agents") return tabs.filter((t) => agentTabIds.has(t.id)).map(row);

  const present = new Set(tabs.map((t) => t.id));
  return entries.filter((e) => present.has(e.tabId)).map((e) => row({ id: e.tabId, kind: "" }));
}

export function activeAgentCount(entries: AgentEntry[] | undefined): number {
  return entries?.length ?? 0;
}
