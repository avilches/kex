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
  } catch {
    restorePlans = new Map();
  }
}

export function consumeRestorePlan(panelId: string): RestorePlan | null {
  if (!restorePlans) return null;
  const plan = restorePlans.get(panelId) ?? null;
  restorePlans.delete(panelId);
  return plan;
}

export async function detachAgentSession(panelId: string): Promise<void> {
  restorePlans?.delete(panelId);
  await invoke("agent_detach_session", { panelId });
}
