import { beforeEach, describe, expect, test } from "vitest";
import { useAgentStore } from "./agentStore";

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
