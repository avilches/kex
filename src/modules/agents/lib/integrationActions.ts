import { invoke } from "@tauri-apps/api/core";
import type { IntegrationAgent } from "./integrations";
import { withIntegration } from "./integrations";

const SETUP_COMMAND: Record<IntegrationAgent, string> = {
  opencode: "agent_setup_opencode",
  omp: "agent_setup_omp",
  pi: "agent_setup_pi",
};

const STATUS_COMMAND: Record<IntegrationAgent, string> = {
  opencode: "agent_opencode_plugin_status",
  omp: "agent_omp_extension_status",
  pi: "agent_pi_extension_status",
};

// Applies a change to the stored list of installed integrations.
type Update = (change: (current: IntegrationAgent[]) => IntegrationAgent[]) => Promise<void>;

export function integrationStatus(agent: IntegrationAgent): Promise<boolean> {
  return invoke<boolean>(STATUS_COMMAND[agent]);
}

// The flag is written only after the file is on disk, so a failed install never leaves the
// startup sync believing there is something to maintain.
export async function installIntegration(agent: IntegrationAgent, update: Update): Promise<void> {
  await invoke(SETUP_COMMAND[agent]);
  await update((current) => withIntegration(current, agent, true));
}

export async function removeIntegration(agent: IntegrationAgent, update: Update): Promise<void> {
  await invoke("agent_remove_integration", { agent });
  await update((current) => withIntegration(current, agent, false));
}

// Rewrites the files the user installed. Only a file that is not Kex's any more stops being
// tracked: one that is merely missing (a dotfiles link or a synced folder not there yet) stays
// on the list, since the sync never creates a file and Install adds it back anyway.
export async function syncIntegrations(
  tracked: readonly IntegrationAgent[],
  update: Update,
): Promise<void> {
  if (tracked.length === 0) return;
  const foreign = await invoke<string[]>("agent_sync_integrations", { agents: [...tracked] });
  if (foreign.length === 0) return;
  await update((current) => current.filter((a) => !foreign.includes(a)));
}
