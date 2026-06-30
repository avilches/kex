import { describe, expect, test } from "vitest";
import { buildAgentEntries } from "./notificationList";
import type { AgentNotification, AgentSession } from "./types";

function session(p: Partial<AgentSession> & { panelId: string }): AgentSession {
  return {
    panelId: p.panelId,
    workspaceId: p.workspaceId ?? "tab",
    agent: p.agent ?? "claude",
    status: p.status ?? "idle",
    startedAt: p.startedAt ?? 0,
    lastActivityAt: p.lastActivityAt ?? 0,
    attentionSince: p.attentionSince ?? null,
    restored: p.restored ?? false,
    restoreError: p.restoreError ?? false,
    restoreErrorReason: p.restoreErrorReason,
    meta: p.meta,
  };
}

function notif(
  p: Partial<AgentNotification> & {
    panelId: string;
    kind: AgentNotification["kind"];
  },
): AgentNotification {
  return {
    id: p.id ?? `n-${p.panelId}`,
    source: p.source ?? "terminal",
    panelId: p.panelId,
    workspaceId: p.workspaceId ?? "tab",
    agent: p.agent ?? "claude",
    kind: p.kind,
    at: p.at ?? 0,
    read: p.read ?? false,
  };
}

describe("buildAgentEntries", () => {
  test("una sola entrada por agente aunque haya varias notificaciones del mismo panel", () => {
    const notifs = [
      notif({ panelId: "p1", kind: "error", at: 30 }),
      notif({ panelId: "p1", kind: "error", at: 20, id: "old1" }),
      notif({ panelId: "p1", kind: "error", at: 10, id: "old2" }),
    ];
    const entries = buildAgentEntries({}, notifs);
    expect(entries).toHaveLength(1);
    expect(entries[0].panelId).toBe("p1");
    // se queda con la primera (la mas reciente, ya esta al frente del array)
    expect(entries[0].at).toBe(30);
  });

  test("el dot naranja (waiting) se deriva de la sesion viva, no de la notificacion", () => {
    const sessions = {
      p1: session({ panelId: "p1", status: "waiting", attentionSince: 100 }),
    };
    const notifs = [notif({ panelId: "p1", kind: "error", at: 50 })];
    const entries = buildAgentEntries(sessions, notifs);
    expect(entries).toHaveLength(1);
    expect(entries[0].visual).toBe("waiting");
    expect(entries[0].pending).toBe(true);
  });

  test("orden: waiting primero, luego working, luego error; por tiempo desc dentro del grupo", () => {
    const sessions = {
      w1: session({ panelId: "w1", status: "waiting", attentionSince: 10 }),
      w2: session({ panelId: "w2", status: "waiting", attentionSince: 20 }),
      run: session({ panelId: "run", status: "working", lastActivityAt: 5 }),
      fail: session({
        panelId: "fail",
        status: "working",
        restoreError: true,
        lastActivityAt: 99,
      }),
    };
    const entries = buildAgentEntries(sessions, []);
    expect(entries.map((e) => e.panelId)).toEqual(["w2", "w1", "run", "fail"]);
    expect(entries.map((e) => e.visual)).toEqual([
      "waiting",
      "waiting",
      "working",
      "error",
    ]);
  });

  test("una sesion idle (ya vista) no se muestra", () => {
    const sessions = {
      p1: session({ panelId: "p1", status: "idle", lastActivityAt: 5 }),
    };
    const notifs = [notif({ panelId: "p1", kind: "attention", at: 50 })];
    const entries = buildAgentEntries(sessions, notifs);
    expect(entries).toHaveLength(0);
  });

  test("attention sin sesion (ya vista, sesion cerrada) se omite", () => {
    const notifs = [notif({ panelId: "p1", kind: "attention", at: 50 })];
    const entries = buildAgentEntries({}, notifs);
    expect(entries).toHaveLength(0);
  });

  test("una notif error cuenta como pending solo si no esta leida", () => {
    const notifs = [
      notif({ panelId: "a", kind: "error", at: 30, read: false }),
      notif({ panelId: "b", kind: "error", at: 20, read: true }),
    ];
    const entries = buildAgentEntries({}, notifs);
    const byPanel = Object.fromEntries(entries.map((e) => [e.panelId, e]));
    expect(byPanel.a.pending).toBe(true);
    expect(byPanel.b.pending).toBe(false);
  });

  test("restoreError se muestra como error pendiente", () => {
    const sessions = {
      p1: session({
        panelId: "p1",
        status: "working",
        restoreError: true,
        lastActivityAt: 7,
      }),
    };
    const entries = buildAgentEntries(sessions, []);
    expect(entries[0].visual).toBe("error");
    expect(entries[0].pending).toBe(true);
  });
});
