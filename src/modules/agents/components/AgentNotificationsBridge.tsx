import type { Workspace } from "@/modules/workspaces";
import { findPanelPane, focusedPanelId } from "@/modules/workspaces";
import { leafIdForPty } from "@/modules/terminal";
import { getOscTitle } from "@/modules/terminal/lib/oscTitleStore";
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

function panelInfo(
  workspaces: Workspace[],
  panelId: string,
): { workspaceId: string; title: string } | null {
  for (const ws of workspaces) {
    const result = findPanelPane(ws.paneTree, panelId);
    if (result) {
      const cwd =
        result.panel.kind === "terminal" ? result.panel.cwd : undefined;
      const cwdParts = cwd ? cwd.split(/[\\/]/).filter(Boolean) : [];
      const title = cwd ? (cwdParts[cwdParts.length - 1] ?? cwd) : ws.title;
      return { workspaceId: ws.id, title };
    }
  }
  return null;
}

/** True when this panel is the one the user is actively looking at (active workspace, active pane, active panel). */
function isPanelVisible(ctx: Ctx, workspaceId: string, panelId: string): boolean {
  if (ctx.activeWorkspaceId !== workspaceId) return false;
  const ws = ctx.workspaces.find((w) => w.id === workspaceId);
  if (!ws) return false;
  return focusedPanelId(ws.paneTree, ws.activePaneId) === panelId;
}

/** The user is both focused on the window and looking at this panel: no attention is pending. */
function isPanelSeen(ctx: Ctx, workspaceId: string, panelId: string): boolean {
  return ctx.focused && isPanelVisible(ctx, workspaceId, panelId);
}

function route(
  session: AgentSession,
  kind: "attention" | "finished" | "error",
  ctx: Ctx,
  extraBody?: string,
): void {
  const info = panelInfo(ctx.workspaces, session.panelId);
  // Prefer the tab's OSC title (what the agent emits) so multiple agents are
  // distinguishable in the toast / OS notification; fall back to the agent name.
  const name = getOscTitle(session.panelId) ?? session.agent;
  const heading =
    kind === "attention"
      ? `${name} needs your input`
      : kind === "error"
        ? `${name} stopped with an error`
        : `${name} finished`;

  const panelVisible = isPanelVisible(ctx, session.workspaceId, session.panelId);

  routeAgentNotification({
    source: "terminal",
    agent: session.agent,
    kind,
    title: heading,
    body: extraBody ?? info?.title,
    focused: ctx.focused,
    visible: panelVisible,
    allowToast: kind === "attention",
    workspaceId: session.workspaceId,
    panelId: session.panelId,
    onActivate: () => ctx.onActivate(session.workspaceId, session.panelId),
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
      const session = store.sessions[panelId];
      if (session && !isPanelSeen(ctx, session.workspaceId, panelId)) {
        store.setStatus(panelId, "waiting");
        route(session, "attention", ctx);
      }
      return;
    }
    case "Stop": {
      // Claude finished its turn: it is now your move. This is the reliable,
      // single end-of-turn signal (idle_prompt is filtered out upstream), so it
      // is what raises the attention dot.
      ensureSession(panelId, ctx, sig.agent ?? "claude");
      const session = store.sessions[panelId];
      if (session && !isPanelSeen(ctx, session.workspaceId, panelId)) {
        store.setStatus(panelId, "waiting");
        route(session, "attention", ctx);
      } else {
        store.setStatus(panelId, "idle");
      }
      return;
    }
    case "PermissionRequest": {
      ensureSession(panelId, ctx, sig.agent ?? "claude");
      const permSession = store.sessions[panelId];
      if (permSession && !isPanelSeen(ctx, permSession.workspaceId, panelId)) {
        store.setStatus(panelId, "waiting");
        route(permSession, "attention", ctx);
      }
      return;
    }
    case "StopFailure": {
      ensureSession(panelId, ctx, sig.agent ?? "claude");
      const failSession = store.sessions[panelId];
      store.finish(panelId);
      invoke("agent_detach_session", { panelId }).catch(() => {});
      if (failSession)
        route(failSession, "error", ctx, sig.message ?? undefined);
      return;
    }
    case "SessionEnd": {
      store.finish(panelId);
      invoke("agent_detach_session", { panelId }).catch(() => {});
      return;
    }
    case "MessageDisplay":
      // Fields TBD after log inspection - for now just ensure session exists.
      ensureSession(panelId, ctx, sig.agent ?? "claude");
      return;
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
  const ctxRef = useRef<Ctx>({
    workspaces,
    activeWorkspaceId,
    focused,
    onActivate,
  });
  ctxRef.current = { workspaces, activeWorkspaceId, focused, onActivate };

  // Looking at an agent's panel clears its attention dot (tab + bell stay in sync).
  useEffect(() => {
    if (!focused) return;
    const ws = workspaces.find((w) => w.id === activeWorkspaceId);
    if (!ws) return;
    const panelId = focusedPanelId(ws.paneTree, ws.activePaneId);
    if (panelId) useAgentStore.getState().markPanelSeen(panelId);
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
      const { panelId, sessionId, cwdLaunch, sessionTitle, model, transcriptPath } = e.payload;
      useAgentStore
        .getState()
        .setMeta(panelId, { sessionId, cwdLaunch, sessionTitle, model, transcriptPath: transcriptPath || undefined });
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
