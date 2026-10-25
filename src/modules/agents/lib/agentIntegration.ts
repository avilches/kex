import { invoke } from "@tauri-apps/api/core";
import {
  setAgentNotifications,
  updateInstalledIntegrations,
  updateIntegrationSuggestions,
} from "@/modules/settings/store";
import { installIntegration, integrationStatus, removeIntegration } from "./integrationActions";
import { withInstalled } from "./integrationSuggestion";
import {
  type AgentId,
  fromInstalledFlag,
  type IntegrationStatus,
  isIntegrationAgent,
} from "./integrations";

// One entry point per action for every agent, so the Settings rows, the bell and the install
// suggestion toast share the same write and the same bookkeeping.

export async function agentStatus(agent: AgentId): Promise<IntegrationStatus> {
  if (isIntegrationAgent(agent)) return integrationStatus(agent);
  return fromInstalledFlag(await invoke<boolean>("agent_claude_hooks_status"));
}

export async function installAgent(agent: AgentId): Promise<void> {
  if (isIntegrationAgent(agent)) {
    await installIntegration(agent, updateInstalledIntegrations);
  } else {
    await invoke("agent_enable_claude_hooks", { refresh: true });
    await setAgentNotifications(true);
  }
  // Never suggested again, even if the user removes it later. The install itself already
  // worked, so a failure here is only logged.
  await updateIntegrationSuggestions((map) => withInstalled(map, agent)).catch((e) =>
    console.error("[kex] could not record the install:", e),
  );
}

export async function removeAgent(agent: AgentId): Promise<void> {
  if (isIntegrationAgent(agent)) {
    await removeIntegration(agent, updateInstalledIntegrations);
  } else {
    await invoke("agent_disable_claude_hooks");
    await setAgentNotifications(false);
  }
}
