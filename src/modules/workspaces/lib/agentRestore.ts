import type { AgentSession } from "@/modules/agents/lib/types";

export type AgentIconMark = "launch-unknown" | null;

export function agentIconMark(session: Pick<AgentSession, "meta"> | undefined): AgentIconMark {
  return session?.meta?.launchKnown === false ? "launch-unknown" : null;
}
