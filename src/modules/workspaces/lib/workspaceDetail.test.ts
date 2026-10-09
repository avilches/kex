import { describe, expect, test } from "vitest";
import type { AgentEntry } from "@/modules/agents/lib/notificationList";
import {
  WORKSPACE_DETAIL_MODES,
  activeAgentCount,
  workspaceDetailRows,
} from "./workspaceDetail";

const tabs = [
  { id: "t1", kind: "terminal" as const },
  { id: "t2", kind: "editor" as const },
  { id: "t3", kind: "terminal" as const },
  { id: "t4", kind: "terminal" as const },
];

function entry(tabId: string, visual: AgentEntry["visual"]): AgentEntry {
  return {
    tabId,
    workspaceId: "ws",
    agent: "claude",
    visual,
    at: 0,
    pending: visual !== "working",
  };
}

// t1 trabaja, t3 espera, t4 es un agente idle (sin entrada), t2 no es agente.
const agentTabIds = new Set(["t1", "t3", "t4"]);
const entries = [entry("t3", "attention"), entry("t1", "working")];

describe("workspaceDetailRows", () => {
  test("none no devuelve filas", () => {
    expect(workspaceDetailRows(tabs, agentTabIds, entries, "none")).toEqual([]);
  });

  test("all-tabs devuelve todas las tabs en su orden, con estado solo las activas", () => {
    expect(workspaceDetailRows(tabs, agentTabIds, entries, "all-tabs")).toEqual([
      { tabId: "t1", visual: "working" },
      { tabId: "t2", visual: null },
      { tabId: "t3", visual: "attention" },
      { tabId: "t4", visual: null },
    ]);
  });

  test("agents devuelve las tabs con agente, incluido el idle, en el orden de las tabs", () => {
    expect(workspaceDetailRows(tabs, agentTabIds, entries, "agents")).toEqual([
      { tabId: "t1", visual: "working" },
      { tabId: "t3", visual: "attention" },
      { tabId: "t4", visual: null },
    ]);
  });

  test("active-agents devuelve solo los agentes con entrada, en orden de urgencia", () => {
    expect(
      workspaceDetailRows(tabs, agentTabIds, entries, "active-agents"),
    ).toEqual([
      { tabId: "t3", visual: "attention" },
      { tabId: "t1", visual: "working" },
    ]);
  });

  test("una entrada de una tab que ya no esta en el workspace se ignora", () => {
    expect(
      workspaceDetailRows(tabs, agentTabIds, [entry("gone", "working")], "active-agents"),
    ).toEqual([]);
  });

  test("sin agentes: all-tabs lista las tabs sin estado; el resto queda vacio", () => {
    const none = new Set<string>();
    expect(workspaceDetailRows(tabs, none, [], "all-tabs")).toHaveLength(4);
    expect(workspaceDetailRows(tabs, none, [], "agents")).toEqual([]);
    expect(workspaceDetailRows(tabs, none, [], "active-agents")).toEqual([]);
  });
});

describe("activeAgentCount", () => {
  test("cuenta las entradas del workspace, errores incluidos", () => {
    expect(activeAgentCount(undefined)).toBe(0);
    expect(activeAgentCount([])).toBe(0);
    expect(
      activeAgentCount([entry("a", "working"), entry("b", "error")]),
    ).toBe(2);
  });
});

describe("WORKSPACE_DETAIL_MODES", () => {
  test("van de mas informacion a menos", () => {
    expect(WORKSPACE_DETAIL_MODES).toEqual([
      "all-tabs",
      "agents",
      "active-agents",
      "none",
    ]);
  });
});
