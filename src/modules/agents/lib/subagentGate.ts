import type { AgentStatus, BackgroundSubagent, SubagentRecord } from "./types";

/** The status a turn-ending Stop produces: background subagents keep the agent working. */
export function stopOutcome(activeSubagents: number, tabSeen: boolean): AgentStatus {
  if (activeSubagents > 0) return "working";
  return tabSeen ? "idle" : "attention";
}

/** Replace the known subagents with the list a Stop reports, keeping what is still running. */
export function reconcileSubagents(
  prev: Record<string, SubagentRecord>,
  list: BackgroundSubagent[],
  now: number,
): Record<string, SubagentRecord> {
  const next: Record<string, SubagentRecord> = {};
  let changed = list.length !== Object.keys(prev).length;
  for (const sub of list) {
    const known = prev[sub.id];
    const description = sub.description || known?.description;
    const agentType = sub.agentType || known?.agentType || "";
    next[sub.id] = { agentType, description, startedAt: known?.startedAt ?? now };
    if (!known || known.description !== description || known.agentType !== agentType) {
      changed = true;
    }
  }
  return changed ? next : prev;
}
