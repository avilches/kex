import { beforeEach, describe, expect, it } from "vitest";
import { isHibernating, unmarkHibernating } from "@/modules/agents/lib/hibernatingTabs";
import { createHibernateFlow, type HibernateFlowDeps } from "./useHibernateFlow";
import type { Tab, Workspace } from "./types";

const term = (id: string, over: Record<string, unknown> = {}): Tab => ({ id, kind: "terminal", ...over }) as Tab;
const ws = (tabs: Tab[], over: Partial<Workspace> = {}): Workspace =>
  ({
    id: "w1",
    title: "W",
    paneTree: { kind: "pane", id: "p1", tabs, activeTabId: tabs[0]?.id ?? null },
    activePaneId: "p1",
    ...over,
  }) as Workspace;

function setup(workspace: Workspace, over: Partial<HibernateFlowDeps> = {}) {
  const calls: string[] = [];
  const deps: HibernateFlowDeps = {
    getWorkspace: () => workspace,
    autosaveEnabled: () => false,
    flushDirtyEditors: async () => void calls.push("flush"),
    settle: async () => void calls.push("settle"),
    live: () => ({ agentOf: () => undefined, runningCommand: () => undefined, scriptState: () => undefined }),
    finishAgent: (id) => void calls.push(`finish:${id}`),
    destroyFloats: async () => void calls.push("floats"),
    hibernate: () => void calls.push("hibernate"),
    setPending: (id) => void calls.push(`pending:${id}`),
    ...over,
  };
  return { flow: createHibernateFlow(deps), calls };
}

describe("createHibernateFlow", () => {
  beforeEach(() => unmarkHibernating(["t1", "t2"]));

  it("hibernates straight away when there is nothing to warn about", async () => {
    const { flow, calls } = setup(ws([term("t1", { restoreOnRestart: true, persistentCommand: "make" })]));
    await flow.request("w1");
    expect(calls).toContain("hibernate");
    expect(calls).not.toContain("pending:w1");
  });

  it("opens the dialog instead when a command would be lost", async () => {
    const { flow, calls } = setup(ws([term("t1")]), {
      live: () => ({ agentOf: () => undefined, runningCommand: () => "npm run dev", scriptState: () => undefined }),
    });
    await flow.request("w1");
    expect(calls).toContain("pending:w1");
    expect(calls).not.toContain("hibernate");
  });

  it("flushes autosave and lets the state settle before reviewing", async () => {
    const { flow, calls } = setup(ws([term("t1")]), { autosaveEnabled: () => true });
    await flow.request("w1");
    expect(calls.indexOf("flush")).toBeLessThan(calls.indexOf("settle"));
    expect(calls.indexOf("settle")).toBeLessThan(calls.indexOf("hibernate"));
  });

  it("marks tabs, finishes each agent session and closes floats before flagging", async () => {
    const { flow, calls } = setup(ws([term("t1"), term("t2")]));
    await flow.perform("w1");
    expect(isHibernating("t1") && isHibernating("t2")).toBe(true);
    expect(calls).toEqual(["pending:null", "finish:t1", "finish:t2", "floats", "hibernate"]);
  });

  it("hibernates once when performed twice at the same time", async () => {
    const { flow, calls } = setup(ws([term("t1")]));
    await Promise.all([flow.perform("w1"), flow.perform("w1")]);
    expect(calls.filter((c) => c === "hibernate")).toHaveLength(1);
  });

  it("ignores a workspace that is already hibernated", async () => {
    const { flow, calls } = setup(ws([term("t1")], { hibernated: true }));
    await flow.request("w1");
    await flow.perform("w1");
    expect(calls).toEqual([]);
  });
});
