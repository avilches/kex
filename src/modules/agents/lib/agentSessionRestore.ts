import { invoke } from "@tauri-apps/api/core";
import { warn } from "@tauri-apps/plugin-log";
import { toast } from "sonner";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setOscTitle } from "@/modules/terminal/lib/oscTitleStore";
import type { NotificationKind } from "@/modules/agents/lib/types";
import { isHibernating } from "@/modules/agents/lib/hibernatingTabs";
import {
  RESUME_CHECK_MS,
  describeSilentResume,
  expectsSessionReport,
  hasResumed,
} from "@/modules/agents/lib/restoreCheck";

export type RestorePlan = {
  tabId: string;
  agent: string;
  resumeCmd: string;
  attemptedCmd: string;
  cwdLaunch: string;
  errorReason: string;
  title?: string | null;
  notification?: string | null;
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

type StagedSnapshot = {
  title: string | null;
  notification: NotificationKind | null;
  stagedAt: number;
};
const stagedSnapshots = new Map<string, StagedSnapshot>();

// The resumed agent registers within seconds of the command being typed. A session that
// shows up much later (the resume failed and the user launched an agent by hand) is a
// different one and must not inherit the old name and notification.
export const STAGED_SNAPSHOT_TTL_MS = 90_000;

function isNotificationKind(v: string | null | undefined): v is NotificationKind {
  return v === "attention" || v === "finished" || v === "error";
}

// The name and notification the tab had when Kex closed. They are applied when the
// resumed agent registers its session, not before: a shell prompt that sets its own
// terminal title would overwrite the name, and the notification needs a session to attach to.
// Keyed by the tab that actually spawns the PTY, which is not `plan.tabId` for a reopened
// closed tab (its plan was fetched under the old id).
export function stageRestoredSnapshot(tabId: string, plan: RestorePlan): void {
  const title = plan.title || null;
  const notification = isNotificationKind(plan.notification) ? plan.notification : null;
  const now = Date.now();
  for (const [id, staged] of stagedSnapshots) {
    if (now - staged.stagedAt > STAGED_SNAPSHOT_TTL_MS) stagedSnapshots.delete(id);
  }
  if (title || notification) {
    stagedSnapshots.set(tabId, { title, notification, stagedAt: now });
  }
}

export function stagedSnapshotCount(): number {
  return stagedSnapshots.size;
}

// Puts the staged name and notification back, silently: no toast and no OS notification,
// since the user already knew about it before restarting.
// Returns whether anything was applied.
export function applyStagedSnapshot(tabId: string): boolean {
  const staged = stagedSnapshots.get(tabId);
  if (!staged) return false;
  stagedSnapshots.delete(tabId);
  if (Date.now() - staged.stagedAt > STAGED_SNAPSHOT_TTL_MS) return false;
  const store = useAgentStore.getState();
  const session = store.sessions[tabId];
  if (staged.title) setOscTitle(tabId, staged.title);
  if (!staged.notification || !session) return true;
  // The bell entry honors the same switch as every other notification; the dot does not.
  if (usePreferencesStore.getState().agentNotifications) {
    store.pushNotification({
      source: "terminal",
      tabId,
      workspaceId: session.workspaceId,
      agent: session.agent,
      kind: staged.notification,
    });
  }
  if (staged.notification === "attention") store.setStatus(tabId, "attention");
  return true;
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
const resumeWatches = new Map<string, ReturnType<typeof setTimeout>>();

export function watchResume(plan: RestorePlan): void {
  if (!import.meta.env.DEV || !expectsSessionReport(plan.agent)) return;
  clearTimeout(resumeWatches.get(plan.tabId));
  resumeWatches.set(
    plan.tabId,
    setTimeout(() => {
      resumeWatches.delete(plan.tabId);
      if (isHibernating(plan.tabId)) return;
      if (hasResumed(useAgentStore.getState().sessions[plan.tabId])) return;
      const msg = describeSilentResume(plan);
      void warn(`[agent-session] ${msg}`);
      toast.warning(msg, { duration: 20_000 });
    }, RESUME_CHECK_MS),
  );
}
