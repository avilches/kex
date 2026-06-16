import { beforeEach, describe, expect, test } from "vitest";
import { useAgentStore } from "./agentStore";

describe("agentStore.setMeta", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {} });
  });

  test("no-op cuando el panelId no existe", () => {
    useAgentStore.getState().setMeta("unknown", { sessionId: "abc" });
    expect(useAgentStore.getState().sessions).toEqual({});
  });

  test("asigna sessionId a una sesion existente", () => {
    useAgentStore.getState().start("panel-1", "tab-1", "claude");
    useAgentStore.getState().setMeta("panel-1", { sessionId: "sess-abc" });
    expect(useAgentStore.getState().sessions["panel-1"].meta?.sessionId).toBe("sess-abc");
  });

  test("merge con meta existente sin pisar otros campos", () => {
    useAgentStore.getState().start("panel-1", "tab-1", "claude");
    useAgentStore.getState().setMeta("panel-1", { sessionId: "sess-abc" });
    useAgentStore.getState().setMeta("panel-1", { cwdLaunch: "/home/user/proyecto" });
    const meta = useAgentStore.getState().sessions["panel-1"].meta;
    expect(meta?.sessionId).toBe("sess-abc");
    expect(meta?.cwdLaunch).toBe("/home/user/proyecto");
  });

  test("sobreescribe un campo de meta en una llamada posterior", () => {
    useAgentStore.getState().start("panel-1", "tab-1", "claude");
    useAgentStore.getState().setMeta("panel-1", { sessionId: "viejo" });
    useAgentStore.getState().setMeta("panel-1", { sessionId: "nuevo" });
    expect(useAgentStore.getState().sessions["panel-1"].meta?.sessionId).toBe("nuevo");
  });

  test("setMeta no modifica otros campos de la sesion", () => {
    useAgentStore.getState().start("panel-1", "tab-1", "claude");
    const before = useAgentStore.getState().sessions["panel-1"];
    useAgentStore.getState().setMeta("panel-1", { sessionId: "abc" });
    const after = useAgentStore.getState().sessions["panel-1"];
    expect(after.agent).toBe(before.agent);
    expect(after.status).toBe(before.status);
    expect(after.startedAt).toBe(before.startedAt);
  });
});
