import type { Workspace } from "@/modules/workspaces";
import { findTabPane, focusedTabId } from "@/modules/workspaces";
import { leafIdForPty } from "@/modules/terminal";
import { getOscTitle } from "@/modules/terminal/lib/oscTitleStore";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { routeAgentNotification } from "../lib/route";
import type { AgentSession, AgentSignal } from "../lib/types";
import { useWindowFocus } from "../lib/useWindowFocus";
import { useAgentStore } from "../store/agentStore";

type Activate = (workspaceId: string, tabId: string) => void;
type AgentSessionMetaPayload = {
  tabId: string;
  sessionId: string;
  cwdLaunch: string;
  sessionTitle: string;
  model: string;
  transcriptPath: string;
};
type Ctx = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  focused: boolean;
  onActivate: Activate;
};

function tabInfo(
  workspaces: Workspace[],
  tabId: string,
): { workspaceId: string; title: string } | null {
  for (const ws of workspaces) {
    const result = findTabPane(ws.paneTree, tabId);
    if (result) {
      const cwd =
        result.tab.kind === "terminal" ? result.tab.cwd : undefined;
      const cwdParts = cwd ? cwd.split(/[\\/]/).filter(Boolean) : [];
      const title = cwd ? (cwdParts[cwdParts.length - 1] ?? cwd) : ws.title;
      return { workspaceId: ws.id, title };
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
  // Prefer the tab's OSC title (what the agent emits) so multiple agents are
  // distinguishable in the toast / OS notification; fall back to the agent name.
  const name = getOscTitle(session.tabId) ?? session.agent;
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

function ensureSession(tabId: string, ctx: Ctx, agent: string): boolean {
  const store = useAgentStore.getState();
  if (store.sessions[tabId]) return true;
  const info = tabInfo(ctx.workspaces, tabId);
  if (!info) return false;
  store.start(tabId, info.workspaceId, agent);
  return true;
}

function ensureSessionIdle(tabId: string, ctx: Ctx, agent: string): boolean {
  const store = useAgentStore.getState();
  if (store.sessions[tabId]) return true;
  const info = tabInfo(ctx.workspaces, tabId);
  if (!info) return false;
  store.startIdle(tabId, info.workspaceId, agent);
  return true;
}

function handleSignal(sig: AgentSignal, ctx: Ctx): void {
  const tabId = leafIdForPty(sig.id);
  if (tabId === null) return;
  const store = useAgentStore.getState();

  switch (sig.kind) {
    case "started":
      ensureSessionIdle(tabId, ctx, sig.agent ?? "claude");
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
      // is what raises the attention dot.
      ensureSession(tabId, ctx, sig.agent ?? "claude");
      const session = store.sessions[tabId];
      if (session && !isTabSeen(ctx, session.workspaceId, tabId)) {
        store.setStatus(tabId, "attention");
        route(session, "attention", ctx);
      } else {
        store.setStatus(tabId, "idle");
      }
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
      const failSession = store.sessions[tabId];
      store.finish(tabId);
      invoke("agent_detach_session", { tabId }).catch(() => {});
      if (failSession)
        route(failSession, "error", ctx, sig.message ?? undefined);
      return;
    }
    case "SessionEnd": {
      store.finish(tabId);
      invoke("agent_detach_session", { tabId }).catch(() => {});
      return;
    }
    case "MessageDisplay":
      // Fields TBD after log inspection - for now just ensure session exists.
      ensureSession(tabId, ctx, sig.agent ?? "claude");
      return;
    case "exited":
      ensureSession(tabId, ctx, sig.agent ?? "claude");
      store.finish(tabId);
      invoke("agent_detach_session", { tabId }).catch(() => {});
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

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    listen<AgentSignal>("kex:agent-signal", (e) =>
      handleSignal(e.payload, ctxRef.current),
    )
      .then((u) => {
        if (alive) unlisten = u;
        else u();
      })
      .catch((e) => console.error("[kex:agent] listen failed:", e));
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    listen<AgentSessionMetaPayload>("kex:agent-session-meta", (e) => {
      const { tabId, sessionId, cwdLaunch, sessionTitle, model, transcriptPath } = e.payload;
      useAgentStore
        .getState()
        .setMeta(tabId, { sessionId, cwdLaunch, sessionTitle, model, transcriptPath: transcriptPath || undefined });
    })
      .then((u) => {
        if (alive) unlisten = u;
        else u();
      })
      .catch((e) =>
        console.error("[kex:agent] listen session-meta failed:", e),
      );
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  return null;
}
