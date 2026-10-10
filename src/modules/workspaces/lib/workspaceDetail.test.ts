import { describe, expect, test } from "vitest";
import type { AgentEntry } from "@/modules/agents/lib/notificationList";
import {
  type DetailFilter,
  TERMINAL_DETAIL_MODES,
  activeAgentCount,
  hasDetail,
  workspaceDetailRows,
} from "./workspaceDetail";

const tabs = [
  { id: "t1", kind: "terminal" },
  { id: "e1", kind: "editor" },
  { id: "t2", kind: "terminal" },
  { id: "m1", kind: "markdown" },
  { id: "b1", kind: "browser" },
  { id: "t3", kind: "terminal" },
  { id: "g1", kind: "git-diff" },
  { id: "g2", kind: "git-history" },
  { id: "g3", kind: "git-commit-file" },
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

// t1 trabaja, t2 espera, t3 es un agente idle (sin entrada).
const agentTabIds = new Set(["t1", "t2", "t3"]);
const entries = [entry("t2", "attention"), entry("t1", "working")];

const off = { editors: false, browsers: false, git: false };
const filter = (f: Partial<DetailFilter>): DetailFilter => ({
  terminals: "all",
  ...off,
  ...f,
});
const ids = (f: Partial<DetailFilter>) =>
  workspaceDetailRows(tabs, agentTabIds, entries, filter(f)).map((r) => r.tabId);

describe("workspaceDetailRows: terminals", () => {
  test("all lists every terminal in tab order, with a visual only for the active ones", () => {
    expect(
      workspaceDetailRows(tabs, agentTabIds, entries, filter({ terminals: "all" })),
    ).toEqual([
      { tabId: "t1", visual: "working" },
      { tabId: "t2", visual: "attention" },
      { tabId: "t3", visual: null },
    ]);
  });

  test("agents lists the terminals with an agent, idle ones included", () => {
    expect(ids({ terminals: "agents" })).toEqual(["t1", "t2", "t3"]);
    expect(
      workspaceDetailRows(tabs, new Set(["t2"]), entries, filter({ terminals: "agents" })).map(
        (r) => r.tabId,
      ),
    ).toEqual(["t2"]);
  });

  test("active-agents lists only the ones with an entry, in urgency order", () => {
    expect(ids({ terminals: "active-agents" })).toEqual(["t2", "t1"]);
  });

  test("none lists no terminals", () => {
    expect(ids({ terminals: "none" })).toEqual([]);
  });

  test("an entry of a tab that is no longer in the workspace is ignored", () => {
    expect(
      workspaceDetailRows(tabs, agentTabIds, [entry("gone", "working")], filter({ terminals: "active-agents" })),
    ).toEqual([]);
  });
});

describe("workspaceDetailRows: other kinds", () => {
  test("editors adds editor and markdown tabs, always without a visual", () => {
    expect(ids({ terminals: "none", editors: true })).toEqual(["e1", "m1"]);
    expect(
      workspaceDetailRows(tabs, agentTabIds, entries, filter({ terminals: "none", editors: true })),
    ).toEqual([
      { tabId: "e1", visual: null },
      { tabId: "m1", visual: null },
    ]);
  });

  test("browsers adds browser tabs", () => {
    expect(ids({ terminals: "none", browsers: true })).toEqual(["b1"]);
  });

  test("git adds git-diff, git-history and git-commit-file tabs", () => {
    expect(ids({ terminals: "none", git: true })).toEqual(["g1", "g2", "g3"]);
  });

  test("the checkboxes are independent of the terminals option", () => {
    expect(ids({ terminals: "agents", editors: true, git: true })).toEqual([
      "t1",
      "e1",
      "t2",
      "m1",
      "t3",
      "g1",
      "g2",
      "g3",
    ]);
  });

  test("active-agents puts the agents first by urgency, then the extra tabs in tab order", () => {
    expect(
      ids({ terminals: "active-agents", editors: true, browsers: true, git: true }),
    ).toEqual(["t2", "t1", "e1", "m1", "b1", "g1", "g2", "g3"]);
  });

  test("everything off lists nothing", () => {
    expect(ids({ terminals: "none" })).toEqual([]);
  });
});

describe("activeAgentCount", () => {
  test("counts the entries of the workspace, errors included", () => {
    expect(activeAgentCount(undefined)).toBe(0);
    expect(activeAgentCount([])).toBe(0);
    expect(activeAgentCount([entry("a", "working"), entry("b", "error")])).toBe(2);
  });
});

describe("TERMINAL_DETAIL_MODES", () => {
  test("go from more information to less", () => {
    expect(TERMINAL_DETAIL_MODES).toEqual(["all", "agents", "active-agents"]);
  });

  test("hasDetail is false only when nothing is included", () => {
    const off = { terminals: "none", editors: false, browsers: false, git: false } as const;
    expect(hasDetail(off)).toBe(false);
    expect(hasDetail({ ...off, git: true })).toBe(true);
    expect(hasDetail({ ...off, terminals: "agents" })).toBe(true);
  });
});
