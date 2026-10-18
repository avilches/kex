import type { RestorePlan } from "@/modules/agents/lib/agentSessionRestore";

export const RESUME_CHECK_MS = 30_000;

export function describeSilentResume(plan: RestorePlan): string {
  return `Agent ${plan.agent} in tab ${plan.tabId} did not report a session after the resume command: ${plan.resumeCmd.trim()}`;
}

// OpenCode's plugin only names a session on its first event, so a restored tab nobody has typed
// in is silent by design; the id is already in the resume command it was launched with.
export function expectsSessionReport(agent: string): boolean {
  return agent.toLowerCase() !== "opencode";
}

export function hasResumed(
  session: { meta?: { sessionId?: string } } | undefined,
): boolean {
  return Boolean(session?.meta?.sessionId);
}
