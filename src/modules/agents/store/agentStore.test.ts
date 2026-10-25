import { beforeEach, describe, expect, test } from "vitest";
import { stopOutcome } from "../lib/subagentGate";
import { useAgentStore } from "./agentStore";

describe("agentStore.clearRestoreError", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {} });
  });

  test("removes a restore-error placeholder", () => {
    useAgentStore.getState().setRestoreError("tab-1", "tab-1", "claude", "gone");
    useAgentStore.getState().clearRestoreError("tab-1");
    expect(useAgentStore.getState().sessions).toEqual({});
  });

  test("never removes a running session", () => {
    useAgentStore.getState().start("tab-1", "tab-1", "claude");
    useAgentStore.getState().clearRestoreError("tab-1");
    expect(useAgentStore.getState().sessions["tab-1"]).toBeDefined();
  });
});

describe("agentStore.setMeta", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {} });
  });

  test("no-op cuando el tabId no existe", () => {
    useAgentStore.getState().setMeta("unknown", { sessionId: "abc" });
    expect(useAgentStore.getState().sessions).toEqual({});
  });

  test("asigna sessionId a una sesion existente", () => {
    useAgentStore.getState().start("tab-1", "tab-1", "claude");
    useAgentStore.getState().setMeta("tab-1", { sessionId: "sess-abc" });
    expect(useAgentStore.getState().sessions["tab-1"].meta?.sessionId).toBe(
      "sess-abc",
    );
  });

  test("merge con meta existente sin pisar otros campos", () => {
    useAgentStore.getState().start("tab-1", "tab-1", "claude");
    useAgentStore.getState().setMeta("tab-1", { sessionId: "sess-abc" });
    useAgentStore
      .getState()
      .setMeta("tab-1", { cwdLaunch: "/home/user/proyecto" });
    const meta = useAgentStore.getState().sessions["tab-1"].meta;
    expect(meta?.sessionId).toBe("sess-abc");
    expect(meta?.cwdLaunch).toBe("/home/user/proyecto");
  });

  test("sobreescribe un campo de meta en una llamada posterior", () => {
    useAgentStore.getState().start("tab-1", "tab-1", "claude");
    useAgentStore.getState().setMeta("tab-1", { sessionId: "viejo" });
    useAgentStore.getState().setMeta("tab-1", { sessionId: "nuevo" });
    expect(useAgentStore.getState().sessions["tab-1"].meta?.sessionId).toBe(
      "nuevo",
    );
  });

  test("setMeta no modifica otros campos de la sesion", () => {
    useAgentStore.getState().start("tab-1", "tab-1", "claude");
    const before = useAgentStore.getState().sessions["tab-1"];
    useAgentStore.getState().setMeta("tab-1", { sessionId: "abc" });
    const after = useAgentStore.getState().sessions["tab-1"];
    expect(after.agent).toBe(before.agent);
    expect(after.status).toBe(before.status);
    expect(after.startedAt).toBe(before.startedAt);
  });
});

describe("agentStore.pushNotification (una por agente)", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {}, notifications: [] });
  });

  test("dos eventos del mismo tab dejan una sola notificacion", () => {
    const push = useAgentStore.getState().pushNotification;
    push({
      source: "terminal",
      agent: "claude",
      kind: "attention",
      workspaceId: "t",
      tabId: "p1",
    });
    push({
      source: "terminal",
      agent: "claude",
      kind: "finished",
      workspaceId: "t",
      tabId: "p1",
    });
    const notifs = useAgentStore.getState().notifications;
    expect(notifs).toHaveLength(1);
    expect(notifs[0].tabId).toBe("p1");
    expect(notifs[0].kind).toBe("finished");
  });

  test("la notificacion reutilizada se mueve al frente", () => {
    const push = useAgentStore.getState().pushNotification;
    push({
      source: "terminal",
      agent: "claude",
      kind: "finished",
      workspaceId: "t",
      tabId: "p1",
    });
    push({
      source: "terminal",
      agent: "claude",
      kind: "finished",
      workspaceId: "t",
      tabId: "p2",
    });
    push({
      source: "terminal",
      agent: "claude",
      kind: "attention",
      workspaceId: "t",
      tabId: "p1",
    });
    const notifs = useAgentStore.getState().notifications;
    expect(notifs.map((n) => n.tabId)).toEqual(["p1", "p2"]);
  });
});

describe("agentStore.markTabSeen", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {}, notifications: [] });
  });

  test("limpia el dot naranja (attention -> idle)", () => {
    const st = useAgentStore.getState();
    st.start("p1", "t", "claude");
    st.setStatus("p1", "attention");
    st.markTabSeen("p1");
    const session = useAgentStore.getState().sessions.p1;
    expect(session.status).toBe("idle");
    expect(session.attentionSince).toBeNull();
  });

  test("no toca una sesion working", () => {
    const st = useAgentStore.getState();
    st.start("p1", "t", "claude");
    st.setStatus("p1", "working");
    st.markTabSeen("p1");
    expect(useAgentStore.getState().sessions.p1.status).toBe("working");
  });

  test("marca como leida la notificacion del tab", () => {
    const st = useAgentStore.getState();
    st.pushNotification({
      source: "terminal",
      agent: "claude",
      kind: "finished",
      workspaceId: "t",
      tabId: "p1",
    });
    st.markTabSeen("p1");
    expect(useAgentStore.getState().notifications[0].read).toBe(true);
  });
});

describe("agentStore.setMeta transcriptPath", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {} });
  });

  test("setMeta stores transcriptPath", () => {
    useAgentStore.getState().start("tab-t", "tab-t", "claude");
    useAgentStore.getState().setMeta("tab-t", { transcriptPath: "/home/user/.claude/projects/abc/session.jsonl" });
    const meta = useAgentStore.getState().sessions["tab-t"]?.meta;
    expect(meta?.transcriptPath).toBe("/home/user/.claude/projects/abc/session.jsonl");
  });
});

describe("agentStore.clearAll", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {}, notifications: [] });
  });

  test("borra notificaciones y apaga todos los dots naranja", () => {
    const st = useAgentStore.getState();
    st.start("p1", "t", "claude");
    st.setStatus("p1", "attention");
    st.start("p2", "t", "claude");
    st.setStatus("p2", "working");
    st.pushNotification({
      source: "terminal",
      agent: "claude",
      kind: "error",
      workspaceId: "t",
      tabId: "p3",
    });

    st.clearAll();

    const next = useAgentStore.getState();
    expect(next.notifications).toEqual([]);
    expect(next.sessions.p1.status).toBe("idle");
    expect(next.sessions.p1.attentionSince).toBeNull();
    // las working siguen corriendo
    expect(next.sessions.p2.status).toBe("working");
  });
});

describe("agentStore closed tab sessions", () => {
  beforeEach(() => {
    useAgentStore.setState({
      sessions: {},
      notifications: [],
      closedSessions: {},
    });
  });

  test("an attention session survives its tab and follows it to the new id", () => {
    const s = useAgentStore.getState();
    s.start("old", "w1", "claude");
    s.setStatus("old", "attention");
    s.stashClosedSession("old");
    s.finish("old");
    s.restoreClosedSession("old", "new", "w1");
    const after = useAgentStore.getState();
    expect(after.sessions.new.status).toBe("attention");
    expect(after.sessions.new.tabId).toBe("new");
    expect(after.closedSessions).toEqual({});
  });

  test("a session that was not waiting on the user is not kept", () => {
    const s = useAgentStore.getState();
    s.start("old", "w1", "claude");
    s.stashClosedSession("old");
    expect(useAgentStore.getState().closedSessions).toEqual({});
  });
});

describe("agentStore.reassignTabWorkspace", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {}, notifications: [] });
  });

  test("no-op cuando el tab no tiene sesion ni notificaciones", () => {
    const before = useAgentStore.getState();
    useAgentStore.getState().reassignTabWorkspace("unknown", "ws-2");
    expect(useAgentStore.getState().sessions).toBe(before.sessions);
    expect(useAgentStore.getState().notifications).toBe(before.notifications);
  });

  test("mueve la sesion y las notificaciones del tab, y solo las suyas", () => {
    useAgentStore.getState().start("tab-1", "ws-1", "claude");
    useAgentStore.getState().start("tab-2", "ws-1", "claude");
    useAgentStore.getState().pushNotification({ source: "terminal", tabId: "tab-1", workspaceId: "ws-1", agent: "claude", kind: "finished" });
    useAgentStore.getState().pushNotification({ source: "terminal", tabId: "tab-2", workspaceId: "ws-1", agent: "claude", kind: "finished" });

    useAgentStore.getState().reassignTabWorkspace("tab-1", "ws-2");

    const { sessions, notifications } = useAgentStore.getState();
    expect(sessions["tab-1"].workspaceId).toBe("ws-2");
    expect(sessions["tab-2"].workspaceId).toBe("ws-1");
    expect(notifications.find((n) => n.tabId === "tab-1")?.workspaceId).toBe("ws-2");
    expect(notifications.find((n) => n.tabId === "tab-2")?.workspaceId).toBe("ws-1");
  });

  test("mueve las notificaciones aunque la sesion ya haya terminado", () => {
    useAgentStore.getState().pushNotification({ source: "terminal", tabId: "tab-1", workspaceId: "ws-1", agent: "claude", kind: "attention" });
    useAgentStore.getState().reassignTabWorkspace("tab-1", "ws-2");
    expect(useAgentStore.getState().notifications[0]?.workspaceId).toBe("ws-2");
    expect(useAgentStore.getState().sessions).toEqual({});
  });
});

describe("agentStore subagents", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {} });
    useAgentStore.getState().start("tab-1", "ws-1", "claude");
  });

  const subagents = () => useAgentStore.getState().sessions["tab-1"].subagents;

  test("a new session has no subagents", () => {
    expect(subagents()).toEqual({});
  });

  test("subagentStarted registers once and keeps the first startedAt", () => {
    const s = useAgentStore.getState();
    s.subagentStarted("tab-1", "a1", "Explore");
    const first = subagents().a1.startedAt;
    s.subagentStarted("tab-1", "a1", "Explore");
    expect(Object.keys(subagents())).toEqual(["a1"]);
    expect(subagents().a1.startedAt).toBe(first);
  });

  test("subagentStopped removes it, and unknown ids or tabs are no-ops", () => {
    const s = useAgentStore.getState();
    s.subagentStarted("tab-1", "a1", "Explore");
    s.subagentStopped("tab-1", "nope");
    s.subagentStopped("no-tab", "a1");
    expect(Object.keys(subagents())).toEqual(["a1"]);
    s.subagentStopped("tab-1", "a1");
    expect(subagents()).toEqual({});
  });

  test("reconcileSubagents replaces the set", () => {
    const s = useAgentStore.getState();
    s.subagentStarted("tab-1", "stale", "Explore");
    s.reconcileSubagents("tab-1", [{ id: "a2", agentType: "Plan", description: "x" }]);
    expect(Object.keys(subagents())).toEqual(["a2"]);
  });

  test("markTabSeen keeps the session working while subagents still run", () => {
    const s = useAgentStore.getState();
    s.subagentStarted("tab-1", "a1", "Explore");
    s.setStatus("tab-1", "attention");
    s.markTabSeen("tab-1");
    const session = useAgentStore.getState().sessions["tab-1"];
    expect(session.status).toBe("working");
    expect(session.attentionSince).toBeNull();
  });

  test("markTabSeen still goes idle when no subagent runs", () => {
    const s = useAgentStore.getState();
    s.setStatus("tab-1", "attention");
    s.markTabSeen("tab-1");
    expect(useAgentStore.getState().sessions["tab-1"].status).toBe("idle");
  });

  test("finish drops the session and its subagents", () => {
    useAgentStore.getState().subagentStarted("tab-1", "a1", "Explore");
    useAgentStore.getState().finish("tab-1");
    expect(useAgentStore.getState().sessions["tab-1"]).toBeUndefined();
  });

  test("a Stop with a running subagent stays working until the final Stop", () => {
    const s = useAgentStore.getState();
    s.subagentStarted("tab-1", "a1", "Explore");
    s.reconcileSubagents("tab-1", [{ id: "a1", agentType: "Explore", description: "" }]);
    const count = () => Object.keys(subagents()).length;
    expect(stopOutcome(count(), false)).toBe("working");
    s.subagentStopped("tab-1", "a1");
    s.reconcileSubagents("tab-1", []);
    expect(stopOutcome(count(), false)).toBe("attention");
  });
});

describe("agentStore.setUsage", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {}, usage: {} });
  });

  test("keeps the same state for an unchanged reading", () => {
    const s = useAgentStore.getState();
    s.setUsage("tab-1", { contextUsedPct: 2 });
    const before = useAgentStore.getState().usage;
    s.setUsage("tab-1", { contextUsedPct: 2 });
    expect(useAgentStore.getState().usage).toBe(before);
  });

  test("an empty reading removes the tab's entry", () => {
    const s = useAgentStore.getState();
    s.setUsage("tab-1", { contextUsedPct: 2 });
    s.setUsage("tab-1", {});
    expect(useAgentStore.getState().usage).toEqual({});
  });

  test("the agent exiting drops its reading", () => {
    const s = useAgentStore.getState();
    s.start("tab-1", "ws-1", "claude");
    s.setUsage("tab-1", { contextUsedPct: 2 });
    s.finish("tab-1");
    expect(useAgentStore.getState().usage).toEqual({});
  });
});
