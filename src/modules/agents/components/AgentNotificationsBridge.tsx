import type { Workspace } from "@/modules/workspaces";
import { findPanelPane } from "@/modules/workspaces";
import { leafIdForPty } from "@/modules/terminal";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { routeAgentNotification } from "../lib/route";
import type { AgentSession, AgentSignal } from "../lib/types";
import { useWindowFocus } from "../lib/useWindowFocus";
import { useAgentStore } from "../store/agentStore";

type Activate = (workspaceId: string, panelId: string) => void;
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
  kind: "attention" | "finished",
  ctx: Ctx,
): void {
  const info = panelInfo(ctx.workspaces, session.panelId);
  const heading =
    kind === "attention"
      ? `${session.agent} needs your input`
      : `${session.agent} finished`;

  routeAgentNotification({
    source: "terminal",
    agent: session.agent,
    kind,
    title: heading,
    body: info?.title,
    focused: ctx.focused,
    visible: ctx.activeWorkspaceId === session.tabId,
    allowToast: kind === "attention",
    tabId: session.tabId,
    panelId: session.panelId,
    onActivate: () => ctx.onActivate(session.tabId, session.panelId),
  });
}

function handleSignal(sig: AgentSignal, ctx: Ctx): void {
  const panelId = leafIdForPty(sig.id);
  if (panelId === null) return;
  const store = useAgentStore.getState();

  switch (sig.kind) {
    case "started": {
      const info = panelInfo(ctx.workspaces, panelId);
      if (!info) return;
      store.start(panelId, info.workspaceId, sig.agent ?? "agent");
      return;
    }
    case "working":
      store.setStatus(panelId, "working");
      return;
    case "attention": {
      store.setStatus(panelId, "waiting");
      const session = store.sessions[panelId];
      if (session) route(session, "attention", ctx);
      return;
    }
    case "finished": {
      const session = store.sessions[panelId];
      if (session) route(session, "finished", ctx);
      store.finish(panelId);
      return;
    }
    case "exited":
      store.finish(panelId);
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
      .catch(() => {});
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  return null;
}
