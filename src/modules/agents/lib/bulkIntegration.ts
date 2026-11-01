import type { RowState } from "./agentRows";
import type { AgentId } from "./integrations";

export type BulkKind = "install" | "remove";
export type BulkResult = { done: AgentId[]; failed: AgentId[]; skipped: AgentId[] };

export function planBulk(kind: BulkKind, states: Partial<Record<AgentId, RowState>>): AgentId[] {
  const wanted = kind === "install" ? "missing" : "installed";
  return (Object.keys(states) as AgentId[]).filter((a) => states[a]?.kind === wanted);
}

// Every run starts at once and none waits for another: each agent writes its own files, and the
// shared hook script and stored lists are written atomically or through a queue. The groups keep
// the plan's agent order, whatever order the runs finish in.
export async function runBulk(
  kind: BulkKind,
  states: Partial<Record<AgentId, RowState>>,
  run: (agent: AgentId) => Promise<void>,
): Promise<BulkResult> {
  const plan = planBulk(kind, states);
  const outcomes = await Promise.allSettled(plan.map((agent) => run(agent)));
  return {
    done: plan.filter((_, i) => outcomes[i].status === "fulfilled"),
    failed: plan.filter((_, i) => outcomes[i].status === "rejected"),
    skipped: (Object.keys(states) as AgentId[]).filter((a) => !plan.includes(a)),
  };
}
