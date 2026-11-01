import type { DetectedEditor } from "@/modules/external-editors/types";
import { AGENT_LABELS, type AgentId, type IntegrationBlock, type IntegrationStatus, blockOf } from "./integrations";

export type KnownAgent = { id: string; name: string; integration: AgentId | null };

const integrable = (id: AgentId): KnownAgent => ({ id, name: AGENT_LABELS[id], integration: id });

// Names mirror display_name in src-tauri/src/modules/editors/agents.rs.
export const KNOWN_AGENTS: readonly KnownAgent[] = [
  integrable("claude"),
  integrable("codex"),
  integrable("opencode"),
  integrable("omp"),
  integrable("pi"),
  { id: "agy", name: "Antigravity", integration: null },
  { id: "openclaude", name: "OpenClaude", integration: null },
  { id: "grok", name: "Grok", integration: null },
  { id: "aider", name: "Aider", integration: null },
  { id: "goose", name: "Goose", integration: null },
  { id: "cursor-agent", name: "Cursor Agent", integration: null },
];

export function detectedAgentIds(editors: readonly DetectedEditor[]): Set<string> {
  return new Set(editors.filter((e) => e.kind === "agent").map((e) => e.id));
}

export type RowState =
  | { kind: "checking" }
  | { kind: "notDetected" }
  | { kind: "detectedOnly" }
  | { kind: "missing" }
  | { kind: "installed" }
  | { kind: "blocked"; block: IntegrationBlock };

export function rowStateOf(input: {
  detected: boolean;
  hasIntegration: boolean;
  status: IntegrationStatus | null;
}): RowState {
  if (!input.detected) return { kind: "notDetected" };
  if (!input.hasIntegration) return { kind: "detectedOnly" };
  if (input.status === null) return { kind: "checking" };
  const block = blockOf(input.status);
  if (block) return { kind: "blocked", block };
  return { kind: input.status === "installed" ? "installed" : "missing" };
}
