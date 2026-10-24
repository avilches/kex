import type { AgentSession } from "@/modules/agents/lib/types";

// OpenCode keeps its history in a database Kex does not touch, so its block has no transcript
// actions: "Transcript not created yet" would stay on screen forever.
const AGENTS_WITHOUT_TRANSCRIPT = new Set(["opencode"]);

const DISPLAY_NAMES: Record<string, string> = {
  opencode: "OpenCode",
  omp: "OMP",
  pi: "Pi",
  codex: "Codex",
};

export function agentDisplayName(agent: string): string {
  const key = agent.toLowerCase();
  return DISPLAY_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export function showsAgentMenu(session: Pick<AgentSession, "agent"> | undefined): boolean {
  return !!session;
}

// Codex frames may carry an empty rollout path; without one there is nothing to reveal, ever.
export function hasTranscriptActions(session: Pick<AgentSession, "agent" | "meta">): boolean {
  const agent = session.agent.toLowerCase();
  if (AGENTS_WITHOUT_TRANSCRIPT.has(agent)) return false;
  if (agent === "codex") return !!session.meta?.transcriptPath;
  return true;
}
