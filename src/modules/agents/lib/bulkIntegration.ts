import type { RowState } from "./agentRows";
import type { AgentId } from "./integrations";

export type BulkKind = "install" | "remove";
export type BulkResult = { done: AgentId[]; failed: AgentId[]; skipped: AgentId[] };

export function planBulk(kind: BulkKind, states: Partial<Record<AgentId, RowState>>): AgentId[] {
  const wanted = kind === "install" ? "missing" : "installed";
  return (Object.keys(states) as AgentId[]).filter((a) => states[a]?.kind === wanted);
}

export async function runBulk(
  kind: BulkKind,
  states: Partial<Record<AgentId, RowState>>,
  run: (agent: AgentId) => Promise<void>,
): Promise<BulkResult> {
  const plan = planBulk(kind, states);
  const result: BulkResult = {
    done: [],
    failed: [],
    skipped: (Object.keys(states) as AgentId[]).filter((a) => !plan.includes(a)),
  };
  for (const agent of plan) {
    try {
      await run(agent);
      result.done.push(agent);
    } catch {
      result.failed.push(agent);
    }
  }
  return result;
}
