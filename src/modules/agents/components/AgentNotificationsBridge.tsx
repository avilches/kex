import type { Workspace } from "@/modules/workspaces";
import { findPanelPane } from "@/modules/workspaces";
import { leafIdForPty } from "@/modules/terminal";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { routeAgentNotification } from "../lib/route";
import type { AgentSession, AgentSignal } from "../lib/types";
import { useWindowFocus } from "../lib/useWindowFocus";
import { useAgentStore } from "../store/agentStore";

type Activate = (workspaceId: string, panelId: string) => void;
type AgentSessionMetaPayload = {
  panelId: string;
  sessionId: string;
  cwdLaunch: string;
};
type Ctx = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  focused: boolean;
  onActivate: Activate;
};

function panelInfo(
  workspaces: Workspace[],
  panelId: string,
): { workspaceId: string; title: string } | null {
  for (const ws of workspaces) {
    const result = findPanelPane(ws.paneTree, panelId);
    if (result) {
      const cwd = result.panel.kind === "terminal" ? result.panel.cwd : undefined;
      const cwdParts = cwd ? cwd.split(/[\\/]/).filter(Boolean) : [];
      const title = cwd ? (cwdParts[cwdParts.length - 1] ?? cwd) : ws.title;
      return { workspaceId: ws.id, title };
    }
  }
  return null;
}

function route(
  session: AgentSession,
  kind: "attention" | "finished" | "error",
  ctx: Ctx,
  extraBody?: string,
): void {
  const info = panelInfo(ctx.workspaces, session.panelId);
  const heading =
    kind === "attention"
      ? `${session.agent} needs your input`
      : kind === "error"
        ? `${session.agent} stopped with an error`
        : `${session.agent} finished`;

  routeAgentNotification({
    source: "terminal",
    agent: session.agent,
    kind,
    title: heading,
    body: extraBody ?? info?.title,
    focused: ctx.focused,
    visible: ctx.activeWorkspaceId === session.tabId,
    allowToast: kind === "attention",
    tabId: session.tabId,
    panelId: session.panelId,
    onActivate: () => ctx.onActivate(session.tabId, session.panelId),
  });
}

function ensureSession(panelId: string, ctx: Ctx, agent: string): boolean {
  const store = useAgentStore.getState();
  if (store.sessions[panelId]) return true;
  const info = panelInfo(ctx.workspaces, panelId);
  if (!info) return false;
  store.start(panelId, info.workspaceId, agent);
  return true;
}

function ensureSessionIdle(panelId: string, ctx: Ctx, agent: string): boolean {
  const store = useAgentStore.getState();
  if (store.sessions[panelId]) return true;
  const info = panelInfo(ctx.workspaces, panelId);
  if (!info) return false;
  store.startIdle(panelId, info.workspaceId, agent);
  return true;
}

function handleSignal(sig: AgentSignal, ctx: Ctx): void {
  const panelId = leafIdForPty(sig.id);
  if (panelId === null) return;
  const store = useAgentStore.getState();

  switch (sig.kind) {
    case "started":
      ensureSessionIdle(panelId, ctx, sig.agent ?? "claude");
      return;
    case "UserPromptSubmit": {
      ensureSession(panelId, ctx, sig.agent ?? "claude");
      store.setStatus(panelId, "working");
      return;
    }
    case "Notification": {
      ensureSession(panelId, ctx, sig.agent ?? "claude");
      store.setStatus(panelId, "waiting");
      const session = store.sessions[panelId];
      if (session) route(session, "attention", ctx);
      return;
    }
    case "Stop": {
      ensureSession(panelId, ctx, sig.agent ?? "claude");
      const session = store.sessions[panelId];
      if (session) route(session, "finished", ctx);
      store.setStatus(panelId, "idle");
      return;
    }
    case "PermissionRequest": {
      ensureSession(panelId, ctx, sig.agent ?? "claude");
      store.setStatus(panelId, "waiting");
      const permSession = store.sessions[panelId];
      if (permSession) route(permSession, "attention", ctx);
      return;
    }
    case "StopFailure": {
      ensureSession(panelId, ctx, sig.agent ?? "claude");
      const failSession = store.sessions[panelId];
      store.finish(panelId);
      invoke("agent_detach_session", { panelId }).catch(() => {});
      if (failSession) route(failSession, "error", ctx, sig.message ?? undefined);
      return;
    }
    case "SessionEnd": {
      store.finish(panelId);
      invoke("agent_detach_session", { panelId }).catch(() => {});
      return;
    }
    case "exited":
      ensureSession(panelId, ctx, sig.agent ?? "claude");
      store.finish(panelId);
      invoke("agent_detach_session", { panelId }).catch(() => {});
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
  const ctxRef = useRef<Ctx>({ workspaces, activeWorkspaceId, focused, onActivate });
  ctxRef.current = { workspaces, activeWorkspaceId, focused, onActivate };

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
      const { panelId, sessionId, cwdLaunch } = e.payload;
      useAgentStore.getState().setMeta(panelId, { sessionId, cwdLaunch });
    })
      .then((u) => {
        if (alive) unlisten = u;
        else u();
      })
      .catch((e) => console.error("[kex:agent] listen session-meta failed:", e));
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  return null;
}
