import { invoke } from "@tauri-apps/api/core";
import type { AgentId, CodexStatus, IntegrationAgent, IntegrationStatus } from "./integrations";
import { fromCodexStatus, fromInstalledFlag, withIntegration } from "./integrations";

const SETUP_COMMAND: Record<IntegrationAgent, string> = {
  opencode: "agent_setup_opencode",
  omp: "agent_setup_omp",
  pi: "agent_setup_pi",
  codex: "agent_setup_codex",
};

// Codex answers with a string state of its own; the others with whether the file is current.
const STATUS_COMMAND: Record<Exclude<IntegrationAgent, "codex">, string> = {
  opencode: "agent_opencode_plugin_status",
  omp: "agent_omp_extension_status",
  pi: "agent_pi_extension_status",
};

// Applies a change to the stored list of installed integrations.
type Update = (change: (current: IntegrationAgent[]) => IntegrationAgent[]) => Promise<void>;

export async function integrationStatus(agent: IntegrationAgent): Promise<IntegrationStatus> {
  if (agent === "codex") return fromCodexStatus(await invoke<CodexStatus>("agent_codex_status"));
  return fromInstalledFlag(await invoke<boolean>(STATUS_COMMAND[agent]));
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

/**
 * One file an install or an uninstall would change: `null` before means new, `null` after means
 * deleted. `note` explains a change the diff alone would not, such as a shared file being reformatted.
 */
export type FilePreview = {
  path: string;
  before: string | null;
  after: string | null;
  note?: string;
};

// Dry run: nothing is written.
export function previewIntegration(agent: AgentId, install: boolean): Promise<FilePreview[]> {
  return invoke<FilePreview[]>("agent_integration_preview", { agent, install });
}
