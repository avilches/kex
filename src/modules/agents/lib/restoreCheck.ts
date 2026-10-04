import type { RestorePlan } from "@/modules/agents/lib/agentSessionRestore";

export const RESUME_CHECK_MS = 30_000;

export function findOrphanedPlans(
  plans: Iterable<RestorePlan>,
  knownTabIds: Set<string>,
): RestorePlan[] {
  return [...plans].filter((p) => !knownTabIds.has(p.tabId));
}

export function describeOrphans(
  total: number,
  orphaned: RestorePlan[],
): string | null {
  if (orphaned.length === 0) return null;
  const tabs = orphaned.map((p) => `${p.tabId} (${p.agent})`).join(", ");
  return `${orphaned.length} of ${total} agent session(s) not restored, their tab no longer exists: ${tabs}`;
}

export function describeSilentResume(plan: RestorePlan): string {
  return `Agent ${plan.agent} in tab ${plan.tabId} did not report a session after the resume command: ${plan.resumeCmd.trim()}`;
}

export function hasResumed(
  session: { meta?: { sessionId?: string } } | undefined,
): boolean {
  return Boolean(session?.meta?.sessionId);
}
