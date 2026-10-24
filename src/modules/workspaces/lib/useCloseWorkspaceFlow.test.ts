import { describe, expect, it } from "vitest";
import { createCloseWorkspaceFlow, type CloseFlowDeps, type PendingClose, type RunningProcess } from "./useCloseWorkspaceFlow";
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

function setup(workspace: Workspace | undefined, processes: RunningProcess[] = [], over: Partial<CloseFlowDeps> = {}) {
  const calls: string[] = [];
  const deps: CloseFlowDeps = {
    getWorkspace: () => workspace,
    autosaveEnabled: () => false,
    flushDirtyEditors: async () => void calls.push("flush"),
    settle: async () => void calls.push("settle"),
    live: () => ({ agentOf: () => undefined, runningCommand: () => undefined, scriptState: () => undefined, actionOf: () => undefined }),
    collectProcesses: async () => processes,
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

  it("asks when a terminal has a running process and passes it on", async () => {
    let pending: PendingClose | null = null;
    const { flow } = setup(ws([term("t1")]), [{ tabId: "t1", label: "vim" }], {
      setPending: (p) => void (pending = p),
    });
    await flow.request("w1");
    expect(pending).toEqual({ id: "w1", processes: [{ tabId: "t1", label: "vim" }] });
  });

  it("does not list a process twice when the tab is a running script", async () => {
    let pending: PendingClose | null = null;
    const { flow } = setup(ws([term("t1")]), [{ tabId: "t1", label: "pnpm" }], {
      live: () => ({
        agentOf: () => undefined,
        runningCommand: () => undefined,
        scriptState: () => "running",
        actionOf: () => ({ name: "dev", command: "pnpm dev" }),
      }),
      setPending: (p) => void (pending = p),
    });
    await flow.request("w1");
    expect((pending as PendingClose | null)?.processes).toEqual([]);
  });

  it("flushes autosave and lets the state settle before reviewing", async () => {
    const { flow, calls } = setup(ws([term("t1")]), [], { autosaveEnabled: () => true });
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
});
