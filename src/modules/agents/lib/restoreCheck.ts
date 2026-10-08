import type { RestorePlan } from "@/modules/agents/lib/agentSessionRestore";

export const RESUME_CHECK_MS = 30_000;

export function describeSilentResume(plan: RestorePlan): string {
  return `Agent ${plan.agent} in tab ${plan.tabId} did not report a session after the resume command: ${plan.resumeCmd.trim()}`;
}

export function hasResumed(
  session: { meta?: { sessionId?: string } } | undefined,
): boolean {
  return Boolean(session?.meta?.sessionId);
}
