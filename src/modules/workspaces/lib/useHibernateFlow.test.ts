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
    saveWorkspaceDocs: async () => true,
    isActive: () => false,
    settle: async () => void calls.push("settle"),
    live: () => ({ agentOf: () => undefined, runningCommand: () => undefined, scriptState: () => undefined }),
    finishAgent: (id) => void calls.push(`finish:${id}`),
    destroyFloats: async () => void calls.push("floats"),
    snapshotTabs: async () => ({}),
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

  it("hands the tab snapshots taken before the hibernation to the hibernate step", async () => {
    const snap = { title: "Fix login", command: "claude --resume abc" };
    let received: unknown;
    const { flow } = setup(ws([term("t1")]), {
      snapshotTabs: async () => ({ t1: snap }),
      hibernate: (_id, snapshots) => void (received = snapshots),
    });
    await flow.request("w1");
    expect(received).toEqual({ t1: snap });
  });

  it("opens the dialog instead when a command would be lost", async () => {
    const { flow, calls } = setup(ws([term("t1")]), {
      live: () => ({ agentOf: () => undefined, runningCommand: () => "npm run dev", scriptState: () => undefined }),
    });
    await flow.request("w1");
    expect(calls).toContain("pending:w1");
    expect(calls).not.toContain("hibernate");
  });

  it("saves every document whatever the autosave preference says, then lets the state settle before reviewing", async () => {
    const { flow, calls } = setup(ws([term("t1")]), {
      saveWorkspaceDocs: async () => (calls.push("save"), true),
    });
    await flow.request("w1");
    expect(calls.indexOf("save")).toBeLessThan(calls.indexOf("settle"));
    expect(calls.indexOf("settle")).toBeLessThan(calls.indexOf("hibernate"));
  });

  it("opens the dialog for a document whose save failed instead of hibernating", async () => {
    const dirty = { id: "e1", kind: "editor", path: "/a.ts", dirty: true } as Tab;
    const { flow, calls } = setup(ws([dirty]), { saveWorkspaceDocs: async () => false });
    await flow.request("w1");
    expect(calls).toContain("pending:w1");
    expect(calls).not.toContain("hibernate");
  });

  it("closes floats, then marks tabs and finishes each agent session right before flagging", async () => {
    const { flow, calls } = setup(ws([term("t1"), term("t2")]));
    await flow.perform("w1");
    expect(isHibernating("t1") && isHibernating("t2")).toBe(true);
    expect(calls).toEqual(["pending:null", "floats", "finish:t1", "finish:t2", "hibernate"]);
  });

  it("leaves tabs unmarked and agents untouched when the workspace turns active while floats close", async () => {
    let active = false;
    const { flow, calls } = setup(ws([term("t1")]), {
      isActive: () => active,
      destroyFloats: async () => void (active = true),
    });
    expect(await flow.requestAuto("w1")).toBe(false);
    expect(isHibernating("t1")).toBe(false);
    expect(calls.some((c) => c.startsWith("finish") || c === "hibernate")).toBe(false);
  });

  it("aborts when a document became dirty while floats closed", async () => {
    let tabs: Tab[] = [term("t1")];
    const { flow, calls } = setup(ws(tabs), {
      getWorkspace: () => ws(tabs),
      destroyFloats: async () => {
        tabs = [term("t1"), { id: "e1", kind: "editor", path: "/a.ts", dirty: true } as Tab];
      },
    });
    await flow.request("w1");
    expect(isHibernating("t1")).toBe(false);
    expect(calls).not.toContain("hibernate");
  });

  it("unmarks the tabs when hibernating throws", async () => {
    const { flow } = setup(ws([term("t1")]), {
      hibernate: () => {
        throw new Error("x");
      },
    });
    await expect(flow.perform("w1")).rejects.toThrow("x");
    expect(isHibernating("t1")).toBe(false);
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

  describe("requestAuto", () => {
    const busy = { agentOf: () => undefined, runningCommand: () => "npm run dev", scriptState: () => undefined };

    it("hibernates when nothing would be lost", async () => {
      const { flow, calls } = setup(ws([term("t1", { restoreOnRestart: true, persistentCommand: "make" })]));
      expect(await flow.requestAuto("w1")).toBe(true);
      expect(calls).toContain("hibernate");
    });

    it("saves the documents before hibernating", async () => {
      const saved: string[] = [];
      const { flow, calls } = setup(ws([term("t1")]), {
        saveWorkspaceDocs: async (id) => (saved.push(id), true),
      });
      await flow.requestAuto("w1");
      expect(saved).toEqual(["w1"]);
      expect(calls).toContain("hibernate");
    });

    it("does nothing when the workspace becomes active while it was saving", async () => {
      let active = false;
      const { flow, calls } = setup(ws([term("t1")]), {
        saveWorkspaceDocs: async () => ((active = true), true),
        isActive: () => active,
      });
      expect(await flow.requestAuto("w1")).toBe(false);
      expect(calls).not.toContain("hibernate");
    });

    it("does nothing for the active workspace", async () => {
      const { flow, calls } = setup(ws([term("t1")]), { isActive: () => true });
      expect(await flow.requestAuto("w1")).toBe(false);
      expect(calls).not.toContain("hibernate");
    });

    it("does nothing when an agent is waiting for the user", async () => {
      const { flow, calls } = setup(ws([term("t1", { restoreOnRestart: true })]), {
        live: () => ({
          agentOf: () => ({ agent: "claude", status: "attention", resumable: true }),
          runningCommand: () => undefined,
          scriptState: () => undefined,
        }),
      });
      expect(await flow.requestAuto("w1")).toBe(false);
      expect(calls).not.toContain("hibernate");
    });

    it("does nothing when a save fails", async () => {
      const { flow, calls } = setup(ws([term("t1")]), { saveWorkspaceDocs: async () => false });
      expect(await flow.requestAuto("w1")).toBe(false);
      expect(calls).not.toContain("hibernate");
    });

    it("does nothing, and never opens the dialog, when a command would be lost", async () => {
      const { flow, calls } = setup(ws([term("t1")]), { live: () => busy });
      expect(await flow.requestAuto("w1")).toBe(false);
      expect(calls).not.toContain("hibernate");
      expect(calls).not.toContain("pending:w1");
    });

    it("does nothing when a document is still dirty after saving", async () => {
      const dirty = { id: "e1", kind: "editor", path: "/a.ts", dirty: true } as Tab;
      const { flow, calls } = setup(ws([dirty]));
      expect(await flow.requestAuto("w1")).toBe(false);
      expect(calls).not.toContain("hibernate");
    });
  });
});
