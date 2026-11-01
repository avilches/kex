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
