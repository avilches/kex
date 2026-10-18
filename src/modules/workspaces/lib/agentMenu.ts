import type { AgentSession } from "@/modules/agents/lib/types";

// OpenCode keeps its history in a database Kex does not touch, so its block has no transcript
// actions: "Transcript not created yet" would stay on screen forever.
const AGENTS_WITHOUT_TRANSCRIPT = new Set(["opencode"]);

const DISPLAY_NAMES: Record<string, string> = { opencode: "OpenCode", omp: "OMP", pi: "Pi" };

export function agentDisplayName(agent: string): string {
  const key = agent.toLowerCase();
  return DISPLAY_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export function showsAgentMenu(session: Pick<AgentSession, "agent"> | undefined): boolean {
  return !!session;
}

export function hasTranscriptActions(session: Pick<AgentSession, "agent">): boolean {
  return !AGENTS_WITHOUT_TRANSCRIPT.has(session.agent.toLowerCase());
}
