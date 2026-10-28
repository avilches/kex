import type { AgentSession } from "@/modules/agents/lib/types";
import type { Tab } from "./types";

export type AgentIconMark = "launch-unknown" | null;

export function agentIconMark(
  _tab: Tab,
  session: Pick<AgentSession, "meta"> | undefined,
): AgentIconMark {
  return session?.meta?.launchKnown === false ? "launch-unknown" : null;
}
