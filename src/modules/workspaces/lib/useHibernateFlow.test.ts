import { beforeEach, describe, expect, it } from "vitest";
import { isHibernating, unmarkHibernating } from "@/modules/agents/lib/hibernatingTabs";
import { createHibernateFlow, type HibernateFlowDeps } from "./useHibernateFlow";
import type { Tab, Workspace } from "./types";

const term = (id: string, over: Record<string, unknown> = {}): Tab => ({ id, kind: "terminal", ...over }) as Tab;
const ws = (tabs: Tab[], activeTabId: string | null = tabs[0]?.id ?? null): Workspace =>
  ({
    id: "w1",
    title: "W",
    paneTree: { kind: "pane", id: "p1", tabs, activeTabId },
    activePaneId: "p1",
  }) as Workspace;

const idle = { agentOf: () => undefined, runningCommand: () => undefined, scriptState: () => undefined, actionOf: () => undefined };

function setup(workspace: Workspace, over: Partial<HibernateFlowDeps> = {}) {
  const calls: string[] = [];
  const deps: HibernateFlowDeps = {
    getWorkspace: () => workspace,
    activeWorkspaceId: () => null,
    live: () => idle,
    finishAgent: (id) => void calls.push(`finish:${id}`),
    snapshotTabs: async (tabs) => Object.fromEntries(tabs.map((t) => [t.id, { at: 1 }])),
    hibernate: (_id, snapshots) => void calls.push(`hibernate:${Object.keys(snapshots).join(",")}`),
    setPending: (p) => void calls.push(p ? `pending:${p.workspaceId}:${p.tabIds.join(",")}` : "pending:null"),
    ...over,
  };
  return { flow: createHibernateFlow(deps), calls };
}

describe("createHibernateFlow", () => {
  beforeEach(() => unmarkHibernating(["t1", "t2", "t3"]));

  it("hibernates straight away when there is nothing to warn about", async () => {
    const { flow, calls } = setup(ws([term("t1", { restoreOnRestart: true, persistentCommand: "make" })]));
    await flow.request("w1", ["t1"]);
    expect(calls).toContain("hibernate:t1");
    expect(calls.some((c) => c.startsWith("pending:w1"))).toBe(false);
  });

  it("hibernates an empty shell without asking", async () => {
    const { flow, calls } = setup(ws([term("t1")]));
    await flow.request("w1", ["t1"]);
    expect(calls).toContain("hibernate:t1");
  });

  it("only touches the tabs it was asked for, and only terminals", async () => {
    const editor = { id: "e1", kind: "editor", path: "/a.ts", dirty: true } as Tab;
    const { flow, calls } = setup(ws([term("t1"), term("t2"), editor]));
    await flow.request("w1", ["t2", "e1"]);
    expect(calls).toContain("hibernate:t2");
    expect(isHibernating("t1")).toBe(false);
  });

  it("never hibernates a tab that is already asleep, or an unknown one", async () => {
    const { flow, calls } = setup(ws([term("t1", { hibernation: { at: 1 } })]));
    await flow.request("w1", ["t1", "ghost"]);
    expect(await flow.perform("w1", ["t1"])).toBe(false);
    expect(await flow.requestAuto("w1", ["t1"])).toBe(false);
    expect(calls).toEqual([]);
  });

  it("hands the snapshots taken before the hibernation to the hibernate step", async () => {
    const snap = { at: 7, command: "claude --resume abc" };
    let received: unknown;
    const { flow } = setup(ws([term("t1")]), {
      snapshotTabs: async () => ({ t1: snap }),
      hibernate: (_id, snapshots) => void (received = snapshots),
    });
    await flow.request("w1", ["t1"]);
    expect(received).toEqual({ t1: snap });
  });

  it("opens the dialog with just the tabs that were asked for when a command would be lost", async () => {
    const { flow, calls } = setup(ws([term("t1"), term("t2")]), {
      live: () => ({ ...idle, runningCommand: (id: string) => (id === "t1" ? "npm run dev" : undefined) }),
    });
    await flow.request("w1", ["t1", "t2"]);
    expect(calls).toContain("pending:w1:t1,t2");
    expect(calls.some((c) => c.startsWith("hibernate"))).toBe(false);
  });

  it("opens the dialog for a working agent and for a running script", async () => {
    const working = { agent: "claude", status: "working" as const, resumable: true };
    const a = setup(ws([term("t1", { restoreOnRestart: true })]), { live: () => ({ ...idle, agentOf: () => working }) });
    await a.flow.request("w1", ["t1"]);
    expect(a.calls).toContain("pending:w1:t1");

    const b = setup(ws([term("t1")]), {
      live: () => ({
        ...idle,
        scriptState: () => "running",
        actionOf: () => ({ name: "dev", command: "pnpm dev" }),
      }),
    });
    await b.flow.request("w1", ["t1"]);
    expect(b.calls).toContain("pending:w1:t1");
  });

  it("marks the tabs and finishes each agent session right before flagging them", async () => {
    const { flow, calls } = setup(ws([term("t1"), term("t2")]));
    await flow.perform("w1", ["t1", "t2"]);
    expect(isHibernating("t1") && isHibernating("t2")).toBe(true);
    expect(calls).toEqual(["pending:null", "finish:t1", "finish:t2", "hibernate:t1,t2"]);
  });

  it("unmarks the tabs when hibernating throws", async () => {
    const { flow } = setup(ws([term("t1")]), {
      hibernate: () => {
        throw new Error("x");
      },
    });
    await expect(flow.perform("w1", ["t1"])).rejects.toThrow("x");
    expect(isHibernating("t1")).toBe(false);
  });

  it("hibernates once when performed twice at the same time", async () => {
    const { flow, calls } = setup(ws([term("t1")]));
    await Promise.all([flow.perform("w1", ["t1"]), flow.perform("w1", ["t1"])]);
    expect(calls.filter((c) => c.startsWith("hibernate"))).toHaveLength(1);
  });

  describe("requestAuto", () => {
    it("hibernates a hidden tab when nothing would be lost", async () => {
      const { flow, calls } = setup(ws([term("t1", { restoreOnRestart: true, persistentCommand: "make" })]));
      expect(await flow.requestAuto("w1", ["t1"])).toBe(true);
      expect(calls).toContain("hibernate:t1");
    });

    it("hibernates an empty shell", async () => {
      const { flow } = setup(ws([term("t1")]));
      expect(await flow.requestAuto("w1", ["t1"])).toBe(true);
    });

    it("leaves a tab alone while it is visible, and takes the hidden ones of the same workspace", async () => {
      const { flow, calls } = setup(ws([term("t1"), term("t2")], "t1"), { activeWorkspaceId: () => "w1" });
      expect(await flow.requestAuto("w1", ["t1", "t2"])).toBe(true);
      expect(calls).toContain("hibernate:t2");
      expect(isHibernating("t1")).toBe(false);
    });

    it("does nothing when the only tab is visible", async () => {
      const { flow, calls } = setup(ws([term("t1")]), { activeWorkspaceId: () => "w1" });
      expect(await flow.requestAuto("w1", ["t1"])).toBe(false);
      expect(calls).toEqual([]);
    });

    it("does nothing when the tab turns visible while its snapshot is taken", async () => {
      let active: string | null = null;
      const { flow, calls } = setup(ws([term("t1")]), {
        activeWorkspaceId: () => active,
        snapshotTabs: async () => ((active = "w1"), { t1: { at: 1 } }),
      });
      expect(await flow.requestAuto("w1", ["t1"])).toBe(false);
      expect(isHibernating("t1")).toBe(false);
      expect(calls.some((c) => c.startsWith("finish") || c.startsWith("hibernate"))).toBe(false);
    });

    it("does nothing when an agent is waiting for the user", async () => {
      const { flow, calls } = setup(ws([term("t1", { restoreOnRestart: true })]), {
        live: () => ({ ...idle, agentOf: () => ({ agent: "claude", status: "attention", resumable: true }) }),
      });
      expect(await flow.requestAuto("w1", ["t1"])).toBe(false);
      expect(calls).toEqual([]);
    });

    it("does nothing for a working agent or a running script", async () => {
      const working = setup(ws([term("t1", { restoreOnRestart: true })]), {
        live: () => ({ ...idle, agentOf: () => ({ agent: "claude", status: "working", resumable: true }) }),
      });
      expect(await working.flow.requestAuto("w1", ["t1"])).toBe(false);
      const script = setup(ws([term("t1")]), {
        live: () => ({ ...idle, scriptState: () => "running", actionOf: () => ({ name: "dev", command: "pnpm dev" }) }),
      });
      expect(await script.flow.requestAuto("w1", ["t1"])).toBe(false);
    });

    it("does nothing, and never opens the dialog, when a command would be lost", async () => {
      const { flow, calls } = setup(ws([term("t1")]), { live: () => ({ ...idle, runningCommand: () => "npm run dev" }) });
      expect(await flow.requestAuto("w1", ["t1"])).toBe(false);
      expect(calls).toEqual([]);
    });

    it("skips only the tabs that would lose something", async () => {
      const { flow, calls } = setup(ws([term("t1"), term("t2")]), {
        live: () => ({ ...idle, runningCommand: (id: string) => (id === "t1" ? "npm run dev" : undefined) }),
      });
      expect(await flow.requestAuto("w1", ["t1", "t2"])).toBe(true);
      expect(calls).toContain("hibernate:t2");
      expect(isHibernating("t1")).toBe(false);
    });
  });
});
