import { invoke } from "@tauri-apps/api/core";
import { warn } from "@tauri-apps/plugin-log";
import { toast } from "sonner";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import {
  RESUME_CHECK_MS,
  describeSilentResume,
  hasResumed,
} from "@/modules/agents/lib/restoreCheck";

export type RestorePlan = {
  tabId: string;
  agent: string;
  resumeCmd: string;
  cwdLaunch: string;
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
        `${p.tabId} agent=${p.agent} cwdLaunch=${p.cwdLaunch}${p.errorReason ? ` ERROR: ${p.errorReason}` : ""}`,
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

// Injects a plan fetched on demand (e.g. via previewResumeCmd for a reopened closed
// tab) into the same map the startup restore flow populates, keyed by the tab id
// that will actually spawn the PTY. consumeRestorePlan then treats it exactly like
// a plan loaded at launch, no matter which one produced it.
export function seedRestorePlan(tabId: string, plan: RestorePlan): void {
  if (!restorePlans) restorePlans = new Map();
  restorePlans.set(tabId, plan);
}

export function consumeRestorePlan(tabId: string): RestorePlan | null {
  if (!restorePlans) return null;
  const plan = restorePlans.get(tabId) ?? null;
  restorePlans.delete(tabId);
  if (plan) {
    console.debug(`[agent-session] consuming restore plan for tab=${tabId} agent=${plan.agent} cwdLaunch=${plan.cwdLaunch}${plan.errorReason ? ` ERROR: ${plan.errorReason}` : ""}`);
  }
  return plan;
}

// Live, read-only preview of the resume command for a single tab (e.g. for the "Run on
// start" menu). Unlike the startup restore plan, it is not consumed and never mutates
// agent-sessions.json, so it can be called on demand while a session is live.
export async function previewResumeCmd(tabId: string): Promise<RestorePlan | null> {
  try {
    return await invoke<RestorePlan | null>("agent_session_preview_cmd", { tabId });
  } catch (err) {
    console.error("[agent-session] previewResumeCmd error:", err);
    return null;
  }
}

export async function detachAgentSession(tabId: string): Promise<void> {
  restorePlans?.delete(tabId);
  await invoke("agent_detach_session", { tabId });
}

// Dev builds only: a resume command that was typed but never produced a SessionStart
// (and so no session id in the store) is otherwise invisible until someone notices.
export function watchResume(plan: RestorePlan): void {
  if (!import.meta.env.DEV) return;
  setTimeout(() => {
    if (hasResumed(useAgentStore.getState().sessions[plan.tabId])) return;
    const msg = describeSilentResume(plan);
    void warn(`[agent-session] ${msg}`);
    toast.warning(msg, { duration: 20_000 });
  }, RESUME_CHECK_MS);
}
