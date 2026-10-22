export const INTEGRATION_AGENTS = ["opencode", "omp", "pi"] as const;
export type IntegrationAgent = (typeof INTEGRATION_AGENTS)[number];

/** Every agent Kex can install an integration for; Claude Code is not tracked in the stored list. */
export type AgentId = "claude" | IntegrationAgent;

export const AGENT_LABELS: Record<AgentId, string> = {
  claude: "Claude Code",
  opencode: "OpenCode",
  omp: "OMP",
  pi: "Pi",
};

/** How long Install and Uninstall show their busy state at least, so a fast write is still seen. */
export const INTEGRATION_MIN_BUSY_MS = 500;

export function isIntegrationAgent(value: unknown): value is IntegrationAgent {
  return typeof value === "string" && (INTEGRATION_AGENTS as readonly string[]).includes(value);
}

// The stored list comes from a user-editable JSON file: keep only known names, once each.
export function parseInstalledIntegrations(raw: unknown): IntegrationAgent[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<IntegrationAgent>();
  for (const item of raw) if (isIntegrationAgent(item)) seen.add(item);
  return INTEGRATION_AGENTS.filter((a) => seen.has(a));
}

export function withIntegration(
  current: readonly IntegrationAgent[],
  agent: IntegrationAgent,
  installed: boolean,
): IntegrationAgent[] {
  const next = new Set(current);
  if (installed) next.add(agent);
  else next.delete(agent);
  return INTEGRATION_AGENTS.filter((a) => next.has(a));
}
