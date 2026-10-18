import type { AgentSession } from "@/modules/agents/lib/types";

// OpenCode keeps its history in a database and reports no model, so the agent block would
// only ever say "Transcript not created yet": it is left out rather than shown empty.
const AGENTS_WITHOUT_MENU = new Set(["opencode"]);

export function showsAgentMenu(session: Pick<AgentSession, "agent"> | undefined): boolean {
  return !!session && !AGENTS_WITHOUT_MENU.has(session.agent.toLowerCase());
}
