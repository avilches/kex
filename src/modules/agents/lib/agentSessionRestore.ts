import { invoke } from "@tauri-apps/api/core";

export type RestorePlan = {
  panelId: string;
  agent: string;
  resumeCmd: string;
  cwd: string;
  errorReason: string;
};

let restorePlans: Map<string, RestorePlan> | null = null;

export async function loadRestorePlans(): Promise<void> {
  try {
    const plans = await invoke<RestorePlan[]>("agent_session_restore_plan");
    restorePlans = new Map(plans.map((p) => [p.panelId, p]));
    if (plans.length > 0) {
      console.debug(`[agent-session] loaded ${plans.length} restore plan(s):`, plans.map((p) =>
        `${p.panelId} agent=${p.agent} cwd=${p.cwd}${p.errorReason ? ` ERROR: ${p.errorReason}` : ""}`,
      ));
    } else {
      console.debug("[agent-session] no restore plans");
    }
  } catch (err) {
    console.error("[agent-session] loadRestorePlans error:", err);
    restorePlans = new Map();
  }
}

export function consumeRestorePlan(panelId: string): RestorePlan | null {
  if (!restorePlans) return null;
  const plan = restorePlans.get(panelId) ?? null;
  restorePlans.delete(panelId);
  if (plan) {
    console.debug(`[agent-session] consuming restore plan for panel=${panelId} agent=${plan.agent} cwd=${plan.cwd}${plan.errorReason ? ` ERROR: ${plan.errorReason}` : ""}`);
  }
  return plan;
}

export async function detachAgentSession(panelId: string): Promise<void> {
  restorePlans?.delete(panelId);
  await invoke("agent_detach_session", { panelId });
}

export function pruneOrphanedPlans(knownPanelIds: Set<string>): void {
  if (!restorePlans) return;
  for (const panelId of restorePlans.keys()) {
    if (!knownPanelIds.has(panelId)) {
      console.debug(`[agent-session] pruning orphaned plan panel=${panelId} (panel no longer in workspace)`);
      void detachAgentSession(panelId);
    }
  }
}
