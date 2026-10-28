import { describe, expect, it } from "vitest";
import { createCloseWorkspaceFlow, type CloseFlowDeps, type PendingClose } from "./useCloseWorkspaceFlow";
import type { Tab, Workspace } from "./types";

const term = (id: string): Tab => ({ id, kind: "terminal" }) as Tab;
const doc = (id: string, dirty: boolean): Tab => ({ id, kind: "editor", path: `/a/${id}.ts`, dirty }) as Tab;
const ws = (tabs: Tab[], over: Partial<Workspace> = {}): Workspace =>
  ({
    id: "w1",
    title: "W",
    paneTree: { kind: "pane", id: "p1", tabs, activeTabId: tabs[0]?.id ?? null },
    activePaneId: "p1",
    ...over,
  }) as Workspace;

function setup(workspace: Workspace | undefined, over: Partial<CloseFlowDeps> = {}) {
  const calls: string[] = [];
  const deps: CloseFlowDeps = {
    getWorkspace: () => workspace,
    autosaveEnabled: () => false,
    flushDirtyEditors: async () => void calls.push("flush"),
    settle: async () => void calls.push("settle"),
    live: () => ({ agentOf: () => undefined, scriptState: () => undefined, actionOf: () => undefined }),
    close: async (id) => void calls.push(`close:${id}`),
    setPending: (p) => void calls.push(`pending:${p ? p.id : "null"}`),
    ...over,
  };
  return { flow: createCloseWorkspaceFlow(deps), calls };
}

describe("createCloseWorkspaceFlow", () => {
  it("closes straight away when nothing is at risk and there are no scripts", async () => {
    const { flow, calls } = setup(ws([term("t1")]));
    await flow.request("w1");
    expect(calls).toContain("close:w1");
    expect(calls).not.toContain("pending:w1");
  });

  it("closes an empty workspace without asking", async () => {
    const { flow, calls } = setup(ws([]));
    await flow.request("w1");
    expect(calls).toContain("close:w1");
  });

  it("asks when the workspace has actions to delete", async () => {
    const actions = [{ id: "ac-1", name: "dev", kind: "script" as const, command: "pnpm dev", ownButton: false }];
    const { flow, calls } = setup(ws([], { actions }));
    await flow.request("w1");
    expect(calls).toContain("pending:w1");
    expect(calls).not.toContain("close:w1");
  });

  it("ignores actions with an empty command", async () => {
    const actions = [{ ...{ id: "ac-1", name: "dev", kind: "script" as const, command: "pnpm dev", ownButton: false }, command: "  " }];
    const { flow, calls } = setup(ws([], { actions }));
    await flow.request("w1");
    expect(calls).toContain("close:w1");
  });

  it("asks when a document has unsaved changes", async () => {
    const { flow, calls } = setup(ws([doc("e1", true)]));
    await flow.request("w1");
    expect(calls).toContain("pending:w1");
  });

  it("closes without asking when a terminal has a process or a script running", async () => {
    const { flow, calls } = setup(ws([term("t1")]), {
      live: () => ({
        agentOf: () => undefined,
        scriptState: () => "running",
        actionOf: () => ({ name: "dev", command: "pnpm dev" }),
      }),
    });
    await flow.request("w1");
    expect(calls).toContain("close:w1");
    expect(calls).not.toContain("pending:w1");
  });

  it("asks about a working agent", async () => {
    let pending: PendingClose | null = null;
    const { flow, calls } = setup(ws([term("t1")]), {
      live: () => ({
        agentOf: () => ({ agent: "claude", status: "working" as const, resumable: true }),
        scriptState: () => undefined,
        actionOf: () => undefined,
      }),
      setPending: (p) => {
        pending = p;
      },
    });
    await flow.request("w1");
    expect(pending).toEqual({ id: "w1" });
    expect(calls).not.toContain("close:w1");
  });

  it("does not ask about an idle agent", async () => {
    const { flow, calls } = setup(ws([term("t1")]), {
      live: () => ({
        agentOf: () => ({ agent: "claude", status: "idle" as const, resumable: true }),
        scriptState: () => undefined,
        actionOf: () => undefined,
      }),
    });
    await flow.request("w1");
    expect(calls).toContain("close:w1");
  });

  it("asks about actions to delete", async () => {
    const actions = [{ id: "ac-1", name: "dev", kind: "script" as const, command: "pnpm dev", ownButton: false }];
    const { flow, calls } = setup(ws([], { actions }));
    await flow.request("w1");
    expect(calls).toContain("pending:w1");
  });

  it("flushes autosave and lets the state settle before reviewing", async () => {
    const { flow, calls } = setup(ws([term("t1")]), { autosaveEnabled: () => true });
    await flow.request("w1");
    expect(calls.indexOf("flush")).toBeLessThan(calls.indexOf("settle"));
    expect(calls.indexOf("settle")).toBeLessThan(calls.indexOf("close:w1"));
  });

  it("clears the pending dialog before closing on confirm", async () => {
    const { flow, calls } = setup(ws([term("t1")]));
    await flow.perform("w1");
    expect(calls).toEqual(["pending:null", "close:w1"]);
  });

  it("does nothing for an unknown workspace", async () => {
    const { flow, calls } = setup(undefined);
    await flow.request("w1");
    expect(calls).toEqual([]);
  });

  describe("requestAndWait", () => {
    const risky = () => ws([doc("d1", true)]);

    it("resolves true when it closes without asking", async () => {
      const { flow, calls } = setup(ws([term("t1")]));
      expect(await flow.requestAndWait("w1")).toBe(true);
      expect(calls).toContain("close:w1");
    });

    it("resolves false for an unknown workspace", async () => {
      const { flow } = setup(undefined);
      expect(await flow.requestAndWait("w1")).toBe(false);
    });

    it("waits for the dialog and resolves true when the close is confirmed", async () => {
      const { flow } = setup(risky());
      let result: boolean | null = null;
      void flow.requestAndWait("w1").then((r) => (result = r));
      await new Promise((r) => setTimeout(r, 0));
      expect(result).toBeNull();
      await flow.perform("w1");
      await new Promise((r) => setTimeout(r, 0));
      expect(result).toBe(true);
    });

    it("resolves false when the dialog is cancelled", async () => {
      const { flow, calls } = setup(risky());
      const done = flow.requestAndWait("w1");
      await new Promise((r) => setTimeout(r, 0));
      flow.cancel();
      expect(await done).toBe(false);
      expect(calls).not.toContain("close:w1");
    });

    it("resolves false when the confirmed close rejects, and rethrows to its caller", async () => {
      const { flow } = setup(risky(), {
        close: async () => {
          throw new Error("boom");
        },
      });
      const done = flow.requestAndWait("w1");
      await new Promise((r) => setTimeout(r, 0));
      await expect(flow.perform("w1")).rejects.toThrow("boom");
      expect(await done).toBe(false);
    });

    it("resolves false for the dialog another request replaces", async () => {
      const { flow } = setup(risky());
      const first = flow.requestAndWait("w1");
      await new Promise((r) => setTimeout(r, 0));
      void flow.requestAndWait("w1");
      expect(await first).toBe(false);
    });
  });
});
