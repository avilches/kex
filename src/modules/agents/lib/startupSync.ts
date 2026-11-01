import { invoke } from "@tauri-apps/api/core";
import type { DetectedEditor } from "@/modules/external-editors/types";
import { detectedAgentIds } from "./agentRows";
import { syncIntegrations } from "./integrationActions";
import type { IntegrationAgent } from "./integrations";

export type SyncPlan = { claude: "refresh" | "disable" | "none"; others: IntegrationAgent[] };

// Needs both detection and an installed integration, and never installs anything new.
export function syncPlan(input: {
  detected: ReadonlySet<string>;
  installed: readonly IntegrationAgent[];
  claudeHooksInstalled: boolean;
  agentNotifications: boolean;
}): SyncPlan {
  let claude: SyncPlan["claude"] = "none";
  if (input.detected.has("claude") && input.claudeHooksInstalled) {
    claude = input.agentNotifications ? "refresh" : "disable";
  }
  return { claude, others: input.installed.filter((a) => input.detected.has(a)) };
}

type Update = Parameters<typeof syncIntegrations>[1];

// Decides on presence, not currency, so outdated hooks are refreshed or removed too. Never
// throws: it runs detached from startup and must not delay the first paint.
export async function runStartupSync(
  prefs: {
    detectedEditors: readonly DetectedEditor[];
    installedIntegrations: readonly IntegrationAgent[];
    agentNotifications: boolean;
  },
  update: Update,
): Promise<void> {
  const detected = detectedAgentIds(prefs.detectedEditors);
  const claudeHooksInstalled = detected.has("claude")
    ? await invoke<boolean>("agent_claude_hooks_present").catch(() => false)
    : false;
  const plan = syncPlan({
    detected,
    installed: prefs.installedIntegrations,
    claudeHooksInstalled,
    agentNotifications: prefs.agentNotifications,
  });
  const jobs: Promise<unknown>[] = [];
  if (plan.claude === "refresh") {
    jobs.push(invoke("agent_enable_claude_hooks", { refresh: false }));
  } else if (plan.claude === "disable") {
    jobs.push(invoke("agent_disable_claude_hooks"));
  }
  // OpenCode, OMP and Pi read their script from their own config folder, so an app update
  // rewrites the ones the user installed instead of leaving them on an old version.
  jobs.push(syncIntegrations(plan.others, update));
  await Promise.allSettled(jobs);
}
