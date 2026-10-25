import type { Workspace } from "@/modules/workspaces";
import { findTabPane, focusedTabId } from "@/modules/workspaces";
import { leafIdForPty } from "@/modules/terminal";
import { clearOscTitle, getOscTitle } from "@/modules/terminal/lib/oscTitleStore";
import { native } from "@/lib/native";
import { tabTitleNow } from "@/modules/workspaces/lib/tabTitleNow";
import { workspaceTitleNow } from "@/modules/workspaces/lib/workspaceTitle";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { useTauriListen } from "@/lib/useTauriListen";
import { applyStagedSnapshot } from "../lib/agentSessionRestore";
import { startAgentSnapshotSync } from "../lib/agentSnapshotSync";
import { routeAgentNotification } from "../lib/route";
import { isHibernating } from "../lib/hibernatingTabs";
import { detachesRecord, endsAgentSession, isRunningAgentSession } from "../lib/sessionEndPolicy";
import { stopOutcome } from "../lib/subagentGate";
import type { AgentSession, AgentSignal } from "../lib/types";
import { useWindowFocus } from "../lib/useWindowFocus";
import { useAgentStore } from "../store/agentStore";
import { suggestIntegration } from "./IntegrationSuggestionToast";

type Activate = (workspaceId: string, tabId: string) => void;
type AgentSessionMetaPayload = {
  tabId: string;
  sessionId: string;
  agent?: string;
  cwdLaunch: string;
  sessionTitle: string;
  model: string;
  transcriptPath: string;
  launchKnown: boolean;
};
const latestAgentCwd = new Map<string, string>();

function handleAgentCwd(tabId: string, cwd: string) {
  const known = useAgentStore.getState().sessions[tabId]?.meta?.agentCwd;
  if (known === cwd) return;
  latestAgentCwd.set(tabId, cwd);
  void native
    .gitResolveRepo(cwd)
    .catch(() => null)
    .then((info) => {
      if (latestAgentCwd.get(tabId) !== cwd) return;
      useAgentStore.getState().setMeta(tabId, {
        agentCwd: cwd,
        worktreeCwd: info?.isWorktree ? info.repoRoot : undefined,
      });
    });
}

export type Ctx = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  focused: boolean;
  onActivate: Activate;
};

function tabInfo(
  workspaces: Workspace[],
  tabId: string,
): { workspaceId: string; title: string; userTitle?: string } | null {
  for (const ws of workspaces) {
    const result = findTabPane(ws.paneTree, tabId);
    if (result) {
      const cwd =
        result.tab.kind === "terminal" ? result.tab.cwd : undefined;
      const cwdParts = cwd ? cwd.split(/[\\/]/).filter(Boolean) : [];
      const title = cwd
        ? (cwdParts[cwdParts.length - 1] ?? cwd)
        : workspaceTitleNow({ ...ws, focusedTab: result.tab });
      return { workspaceId: ws.id, title, userTitle: tabTitleNow(result.tab) || undefined };
    }
  }
  return null;
}

/** True when this tab is the one the user is actively looking at (active workspace, active pane, active tab). */
function isTabVisible(ctx: Ctx, workspaceId: string, tabId: string): boolean {
  if (ctx.activeWorkspaceId !== workspaceId) return false;
  const ws = ctx.workspaces.find((w) => w.id === workspaceId);
  if (!ws) return false;
  return focusedTabId(ws.paneTree, ws.activePaneId) === tabId;
}

/** The user is both focused on the window and looking at this tab: no attention is pending. */
function isTabSeen(ctx: Ctx, workspaceId: string, tabId: string): boolean {
  return ctx.focused && isTabVisible(ctx, workspaceId, tabId);
}

function route(
  session: AgentSession,
  kind: "attention" | "finished" | "error",
  ctx: Ctx,
  extraBody?: string,
): void {
  const info = tabInfo(ctx.workspaces, session.tabId);
  // The user's own tab name wins, then the OSC title (what the agent emits) so
  // multiple agents are distinguishable; fall back to the agent name.
  const name = info?.userTitle ?? getOscTitle(session.tabId) ?? session.agent;
  const heading =
    kind === "attention"
      ? `${name} needs your input`
      : kind === "error"
        ? `${name} stopped with an error`
        : `${name} finished`;

  const tabVisible = isTabVisible(ctx, session.workspaceId, session.tabId);

  routeAgentNotification({
    source: "terminal",
    agent: session.agent,
    kind,
    title: heading,
    body: extraBody ?? info?.title,
    focused: ctx.focused,
    visible: tabVisible,
    allowToast: kind === "attention",
    workspaceId: session.workspaceId,
    tabId: session.tabId,
    onActivate: () => ctx.onActivate(session.workspaceId, session.tabId),
  });
}

// A restored notification for the tab the user is already looking at is moot.
function restoreStaged(tabId: string, ctx: Ctx): void {
  if (!applyStagedSnapshot(tabId)) return;
  const session = useAgentStore.getState().sessions[tabId];
  if (session && isTabSeen(ctx, session.workspaceId, tabId)) {
    useAgentStore.getState().markTabSeen(tabId);
  }
}

function ensureSession(tabId: string, ctx: Ctx, agent: string): boolean {
  const store = useAgentStore.getState();
  if (isRunningAgentSession(store.sessions[tabId])) {
    restoreStaged(tabId, ctx);
    return true;
  }
  const info = tabInfo(ctx.workspaces, tabId);
  if (!info) return false;
  store.start(tabId, info.workspaceId, agent);
  restoreStaged(tabId, ctx);
  return true;
}

function ensureSessionIdle(tabId: string, ctx: Ctx, agent: string): boolean {
  const store = useAgentStore.getState();
  if (isRunningAgentSession(store.sessions[tabId])) {
    restoreStaged(tabId, ctx);
    return true;
  }
  const info = tabInfo(ctx.workspaces, tabId);
  if (!info) return false;
  store.startIdle(tabId, info.workspaceId, agent);
  restoreStaged(tabId, ctx);
  return true;
}

// SessionStart reaches the tab even when the shell line named no known agent (a launcher
// script of the user's), so the session is created here instead of waiting for the first prompt.
export function handleSessionMeta(p: AgentSessionMetaPayload, ctx: Ctx): void {
  ensureSessionIdle(p.tabId, ctx, p.agent ?? "claude");
  useAgentStore.getState().setMeta(p.tabId, {
    sessionId: p.sessionId,
    cwdLaunch: p.cwdLaunch,
    sessionTitle: p.sessionTitle,
    // The OSC prompt event carries no model; an empty one must not wipe the known one.
    ...(p.model ? { model: p.model } : {}),
    transcriptPath: p.transcriptPath || undefined,
    launchKnown: p.launchKnown,
  });
}

export function handleSignal(sig: AgentSignal, ctx: Ctx): void {
  const tabId = sig.tabId ?? leafIdForPty(sig.id);
  if (tabId === null) return;
  const store = useAgentStore.getState();
  if (endsAgentSession(sig.kind)) {
    store.finish(tabId);
    if (detachesRecord(sig.kind, isHibernating(tabId))) {
      invoke("agent_detach_session", { tabId }).catch(() => {});
      // The agent is gone: what it last sent as OSC title must not keep naming the tab.
      clearOscTitle(tabId);
    }
  }

  switch (sig.kind) {
    case "started":
      ensureSessionIdle(tabId, ctx, sig.agent ?? "claude");
      void suggestIntegration(sig.agent ?? "claude");
      return;
    case "UserPromptSubmit": {
      ensureSession(tabId, ctx, sig.agent ?? "claude");
      store.setStatus(tabId, "working");
      return;
    }
    case "Notification": {
      ensureSession(tabId, ctx, sig.agent ?? "claude");
      const session = store.sessions[tabId];
      if (session && !isTabSeen(ctx, session.workspaceId, tabId)) {
        store.setStatus(tabId, "attention");
        route(session, "attention", ctx);
      }
      return;
    }
    case "Stop": {
      // Claude finished its turn: it is now your move. This is the reliable,
      // single end-of-turn signal (idle_prompt is filtered out upstream), so it
      // is what raises the attention dot. A background subagent keeps the agent
      // busy; its completion opens a new turn whose own Stop raises the dot.
      // Read the state fresh: ensureSession and the reconcile below changed it.
      ensureSession(tabId, ctx, sig.agent ?? "claude");
      // Only Claude lists its running subagents on a Stop. OMP and OpenCode report each one
      // as it starts and ends, so without a list the ones tracked so far are kept.
      if (sig.agent === null || sig.agent === "claude" || sig.backgroundSubagents) {
        useAgentStore.getState().reconcileSubagents(tabId, sig.backgroundSubagents ?? []);
      }
      const session = useAgentStore.getState().sessions[tabId];
      if (!session) return;
      const outcome = stopOutcome(
        Object.keys(session.subagents).length,
        isTabSeen(ctx, session.workspaceId, tabId),
      );
      store.setStatus(tabId, outcome);
      if (outcome === "attention") route(session, "attention", ctx, sig.message ?? undefined);
      return;
    }
    case "SubagentStart": {
      if (!sig.agentId) return;
      ensureSession(tabId, ctx, sig.agent ?? "claude");
      store.subagentStarted(tabId, sig.agentId, sig.agentType ?? "", sig.agentDescription);
      return;
    }
    case "SubagentStop": {
      if (!sig.agentId) return;
      store.subagentStopped(tabId, sig.agentId);
      return;
    }
    case "PermissionRequest": {
      ensureSession(tabId, ctx, sig.agent ?? "claude");
      const permSession = store.sessions[tabId];
      if (permSession && !isTabSeen(ctx, permSession.workspaceId, tabId)) {
        store.setStatus(tabId, "attention");
        route(permSession, "attention", ctx);
      }
      return;
    }
    case "StopFailure": {
      ensureSession(tabId, ctx, sig.agent ?? "claude");
      store.setStatus(tabId, "idle");
      const failSession = store.sessions[tabId];
      if (failSession)
        route(failSession, "error", ctx, sig.message ?? undefined);
      return;
    }
    case "SessionEnd":
      // /clear and /resume end the Claude session while the process lives on;
      // its background subagents are assumed gone with it.
      store.forgetSubagents(tabId);
      return;
    case "PostCompact": {
      // A manual /compact ends without a Stop, so this is what leaves the tab idle. An
      // automatic one happens inside a running turn, whose own Stop is still to come.
      if (sig.trigger === "auto") return;
      const session = store.sessions[tabId];
      if (!session) return;
      store.setStatus(tabId, stopOutcome(Object.keys(session.subagents).length, true));
      return;
    }
    case "MessageDisplay":
      // Fields TBD after log inspection - for now just ensure session exists.
      ensureSession(tabId, ctx, sig.agent ?? "claude");
      return;
    case "exited":
      return;
  }
}

export function AgentNotificationsBridge({
  workspaces,
  activeWorkspaceId,
  onActivate,
}: {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onActivate: Activate;
}) {
  const focused = useWindowFocus();
  const ctxRef = useRef<Ctx>({
    workspaces,
    activeWorkspaceId,
    focused,
    onActivate,
  });
  ctxRef.current = { workspaces, activeWorkspaceId, focused, onActivate };

  // Looking at an agent's tab clears its attention dot (tab + bell stay in sync).
  useEffect(() => {
    if (!focused) return;
    const ws = workspaces.find((w) => w.id === activeWorkspaceId);
    if (!ws) return;
    const tabId = focusedTabId(ws.paneTree, ws.activePaneId);
    if (tabId) useAgentStore.getState().markTabSeen(tabId);
  }, [workspaces, activeWorkspaceId, focused]);

  useEffect(() => startAgentSnapshotSync(), []);

  useTauriListen<AgentSignal>("kex:agent-signal", (e) =>
    handleSignal(e.payload, ctxRef.current),
  );

  useTauriListen<AgentSessionMetaPayload>("kex:agent-session-meta", (e) =>
    handleSessionMeta(e.payload, ctxRef.current),
  );

  useTauriListen<{ tabId: string; model: string }>("kex:agent-model", (e) =>
    useAgentStore.getState().setMeta(e.payload.tabId, { model: e.payload.model }),
  );

  useTauriListen<{ tabId: string; cwd: string }>("kex:agent-cwd", (e) =>
    handleAgentCwd(e.payload.tabId, e.payload.cwd),
  );

  return null;
}
