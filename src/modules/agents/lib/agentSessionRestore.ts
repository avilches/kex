import { invoke } from "@tauri-apps/api/core";

export type RestorePlan = {
  tabId: string;
  agent: string;
  resumeCmd: string;
  cwd: string;
  errorReason: string;
};

let restorePlans: Map<string, RestorePlan> | null = null;
// Resolves once plans are loaded so the terminal spawn can make a correct
// consume decision instead of racing the load.
let readyResolve!: () => void;
const readyPromise = new Promise<void>((r) => { readyResolve = r; });

export function restorePlansReady(): Promise<void> {
  return readyPromise;
}

export async function loadRestorePlans(): Promise<void> {
  try {
    const plans = await invoke<RestorePlan[]>("agent_session_restore_plan");
    restorePlans = new Map(plans.map((p) => [p.tabId, p]));
    if (plans.length > 0) {
      console.debug(`[agent-session] loaded ${plans.length} restore plan(s):`, plans.map((p) =>
        `${p.tabId} agent=${p.agent} cwd=${p.cwd}${p.errorReason ? ` ERROR: ${p.errorReason}` : ""}`,
      ));
    } else {
      console.debug("[agent-session] no restore plans");
    }
  } catch (err) {
    console.error("[agent-session] loadRestorePlans error:", err);
    restorePlans = new Map();
  } finally {
    readyResolve();
  }
}

export function consumeRestorePlan(tabId: string): RestorePlan | null {
  if (!restorePlans) return null;
  const plan = restorePlans.get(tabId) ?? null;
  restorePlans.delete(tabId);
  if (plan) {
    console.debug(`[agent-session] consuming restore plan for panel=${tabId} agent=${plan.agent} cwd=${plan.cwd}${plan.errorReason ? ` ERROR: ${plan.errorReason}` : ""}`);
  }
  return plan;
}

export async function detachAgentSession(tabId: string): Promise<void> {
  restorePlans?.delete(tabId);
  await invoke("agent_detach_session", { tabId });
}

export function pruneOrphanedPlans(knownPanelIds: Set<string>): void {
  if (!restorePlans) return;
  for (const tabId of restorePlans.keys()) {
    if (!knownPanelIds.has(tabId)) {
      console.debug(`[agent-session] pruning orphaned plan panel=${tabId} (panel no longer in workspace)`);
      void detachAgentSession(tabId);
    }
  }
}
