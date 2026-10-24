import { isAgentId } from "@/modules/agents/lib/integrationSuggestion";
import type { AgentId, IntegrationStatus } from "@/modules/agents/lib/integrations";

/**
 * What the agent block of a tab menu offers about the integration.
 *
 * - `full`: the integration is there (or its state is not known yet): the block is the usual one.
 * - `install`: the agent can be installed and is not. Session id, model and transcript only ever
 *   arrive through the integration, so they are not shown and "Install" is offered in their place.
 * - `bare`: no integration can be installed here (unknown agent, or a config Kex cannot edit):
 *   the data that never arrives is hidden and nothing is offered.
 */
export type AgentMenuIntegration =
  | { mode: "full" }
  | { mode: "install"; agent: AgentId }
  | { mode: "bare" };

// A status that has not been read yet counts as installed: offering to install something that
// may already be there is worse than showing a plain block for a moment.
export function agentMenuIntegration(
  agent: string,
  status: IntegrationStatus | null,
): AgentMenuIntegration {
  const key = agent.toLowerCase();
  if (!isAgentId(key)) return { mode: "bare" };
  if (status === null || status === "installed") return { mode: "full" };
  if (status === "missing") return { mode: "install", agent: key };
  return { mode: "bare" };
}
