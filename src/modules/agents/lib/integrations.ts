export const INTEGRATION_AGENTS = ["opencode", "omp", "pi", "codex"] as const;
export type IntegrationAgent = (typeof INTEGRATION_AGENTS)[number];

/** Every agent Kex can install an integration for; Claude Code is not tracked in the stored list. */
export type AgentId = "claude" | IntegrationAgent;

export const AGENT_LABELS: Record<AgentId, string> = {
  claude: "Claude Code",
  opencode: "OpenCode",
  omp: "OMP",
  pi: "Pi",
  codex: "Codex",
};

/**
 * What a status check found. `malformed` and `unavailable` block Install: the agent's config
 * cannot be parsed (Kex leaves it untouched), or the agent's folder does not exist yet.
 */
export type IntegrationStatus = "installed" | "missing" | "malformed" | "unavailable";
export type IntegrationBlock = Extract<IntegrationStatus, "malformed" | "unavailable">;

/** What `agent_codex_status` returns. */
export type CodexStatus = "unavailable" | "notInstalled" | "upToDate" | "outdated" | "malformed";

export function blockOf(status: IntegrationStatus | null): IntegrationBlock | null {
  return status === "malformed" || status === "unavailable" ? status : null;
}

export function fromInstalledFlag(installed: boolean): IntegrationStatus {
  return installed ? "installed" : "missing";
}

// An outdated install reads as missing, like a stale OMP or Pi file: Install refreshes it.
export function fromCodexStatus(status: CodexStatus): IntegrationStatus {
  switch (status) {
    case "upToDate":
      return "installed";
    case "malformed":
      return "malformed";
    case "unavailable":
      return "unavailable";
    default:
      return "missing";
  }
}

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
