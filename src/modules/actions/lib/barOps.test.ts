import { describe, expect, it, vi } from "vitest";
import { createBarOps } from "./barOps";
import type { Action } from "./types";

const act = (id: string, over: Partial<Action> = {}): Action => ({
  id,
  name: id,
  runInTerminal: false,
  command: "x {workspace}",
  ownButton: false,
  ...over,
});

function setup(_workspace: Action[], global: Action[]) {
  let globalList = global;
  const d = {
    workspaceId: () => "w1" as string | undefined,
    updateWorkspaceAction: vi.fn(),
    removeWorkspaceAction: vi.fn(),
    reorderWorkspaceActions: vi.fn(),
    promoteWorkspaceAction: vi.fn(),
    demoteGlobalAction: vi.fn(),
    global: {
      get: () => globalList,
      change: vi.fn(async (fn: (l: Action[]) => Action[]) => {
        const before = globalList;
        globalList = fn(before);
        return { before, after: globalList };
      }),
    },
    unlink: vi.fn(),
    fail: vi.fn(),
  };
  return { d, ops: createBarOps(d), globalList: () => globalList };
}

describe("createBarOps", () => {
  it("routes the workspace scope to the workspace store", () => {
    const { d, ops } = setup([act("a")], []);
    ops.update("workspace", "a", { ownButton: false });
    ops.reorder("workspace", "a", "b");
    ops.remove("workspace", "a");
    expect(d.updateWorkspaceAction).toHaveBeenCalledWith("w1", "a", { ownButton: false });
    expect(d.reorderWorkspaceActions).toHaveBeenCalledWith("w1", "a", "b");
    expect(d.removeWorkspaceAction).toHaveBeenCalledWith("w1", "a");
    expect(d.global.change).not.toHaveBeenCalled();
  });

  it("routes the global scope through the serialized global store and unlinks what it removes", async () => {
    const { d, ops, globalList } = setup([], [act("g1", { ownButton: true }), act("g2")]);
    ops.update("global", "g1", { ownButton: false });
    ops.reorder("global", "g2", "g1");
    ops.remove("global", "g1");
    await vi.waitFor(() => expect(d.unlink).toHaveBeenCalledTimes(1));
    expect(globalList().map((a) => a.id)).toEqual(["g2"]);
    expect(d.updateWorkspaceAction).not.toHaveBeenCalled();
  });

  it("reports a failed global write", async () => {
    const { d, ops } = setup([], [act("g1")]);
    d.global.change.mockRejectedValueOnce(new Error("disk"));
    ops.update("global", "g1", { ownButton: false });
    await vi.waitFor(() => expect(d.fail).toHaveBeenCalledWith("Could not save the actions", expect.any(Error)));
  });

  it("moves to the other scope through the store that owns the Action", () => {
    const { d, ops } = setup([act("a", { ownButton: true })], [act("g1", { ownButton: true })]);
    ops.move("workspace", "a");
    expect(d.promoteWorkspaceAction).toHaveBeenCalledWith("w1", "a");
    ops.move("global", "g1");
    expect(d.demoteGlobalAction).toHaveBeenCalledWith("w1", "g1");
    expect(d.updateWorkspaceAction).not.toHaveBeenCalled();
  });

  it("does nothing without an active workspace", () => {
    const { d, ops } = setup([act("a")], []);
    d.workspaceId = () => undefined;
    ops.move("workspace", "a");
    ops.update("workspace", "a", {});
    expect(d.promoteWorkspaceAction).not.toHaveBeenCalled();
    expect(d.updateWorkspaceAction).not.toHaveBeenCalled();
  });
});
