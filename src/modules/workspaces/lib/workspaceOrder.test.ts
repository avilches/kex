import { describe, expect, it } from "vitest";
import {
  groupDropId,
  groupIdFromGroupId,
  groupWorkspaces,
  groupWorkspacesForDrag,
  parseGroupDropId,
  pruneEmptyGroups,
  reconcileGroupsAfterMove,
  visibleWorkspaceOrder,
} from "./workspaceOrder";

type WS = { id: string; groupId?: string };

const GROUPS = [
  { id: "prog", label: "In progress" },
  { id: "done", label: "Done" },
];

// State order intentionally interleaves groups, the way it ends up after the
// user assigns groups without reordering: A,B have no group, C,D are prog,
// E,F are done, but they are scattered in the array.
const WS: WS[] = [
  { id: "A" },
  { id: "C", groupId: "prog" },
  { id: "B" },
  { id: "E", groupId: "done" },
  { id: "D", groupId: "prog" },
  { id: "F", groupId: "done" },
];

describe("groupWorkspaces", () => {
  it("puts the no-group group first, then each group in declaration order", () => {
    const groups = groupWorkspaces(WS, GROUPS);
    expect(groups.map((g) => g.id)).toEqual(["__none__", "prog", "done"]);
    expect(groups.map((g) => g.items.map((w) => w.id))).toEqual([
      ["A", "B"],
      ["C", "D"],
      ["E", "F"],
    ]);
  });

  it("omits empty groups and treats unknown groupId as no-group", () => {
    const groups = groupWorkspaces([{ id: "X", groupId: "ghost" }], GROUPS);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: "__none__", items: [{ id: "X" }] });
  });
});

describe("groupWorkspacesForDrag", () => {
  it("keeps the no-group group and every group, even when empty", () => {
    const groups = groupWorkspacesForDrag([{ id: "A", groupId: "prog" }], GROUPS);
    expect(groups.map((g) => g.id)).toEqual(["__none__", "prog", "done"]);
    expect(groups.map((g) => g.items.map((w) => w.id))).toEqual([[], ["A"], []]);
  });

  it("routes unknown groupId into the always-present no-group group", () => {
    const groups = groupWorkspacesForDrag([{ id: "X", groupId: "ghost" }], GROUPS);
    expect(groups[0]).toMatchObject({ id: "__none__", items: [{ id: "X" }] });
  });
});

describe("group drop id helpers", () => {
  it("round-trips a group id and rejects plain item ids", () => {
    expect(parseGroupDropId(groupDropId("prog"))).toBe("prog");
    expect(parseGroupDropId("ws-123")).toBeNull();
  });

  it("maps the no-group group to a null group", () => {
    expect(groupIdFromGroupId("__none__")).toBeNull();
    expect(groupIdFromGroupId("prog")).toBe("prog");
  });
});

describe("visibleWorkspaceOrder", () => {
  it("matches visual order regardless of state-array order (the navigation bug)", () => {
    const order = visibleWorkspaceOrder(WS, GROUPS, new Set(), "A");
    expect(order.map((w) => w.id)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("drops hidden members of a collapsed group, keeping only its active one", () => {
    const order = visibleWorkspaceOrder(WS, GROUPS, new Set(["prog"]), "C");
    // prog is collapsed and C is active: C stays, D is hidden.
    expect(order.map((w) => w.id)).toEqual(["A", "B", "C", "E", "F"]);
  });

  it("drops a collapsed group entirely when its active member is elsewhere", () => {
    const order = visibleWorkspaceOrder(WS, GROUPS, new Set(["prog"]), "A");
    expect(order.map((w) => w.id)).toEqual(["A", "B", "E", "F"]);
  });

  it("never collapses the no-group group", () => {
    const order = visibleWorkspaceOrder(WS, GROUPS, new Set(["__none__"]), "A");
    expect(order.map((w) => w.id)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });
});

describe("pruneEmptyGroups", () => {
  it("keeps a group that still has a member", () => {
    const next = pruneEmptyGroups(GROUPS, [{ id: "C", groupId: "prog" }]);
    expect(next.map((g) => g.id)).toEqual(["prog"]);
  });

  it("drops a group with no member left", () => {
    const next = pruneEmptyGroups(GROUPS, [{ id: "C", groupId: "prog" }]);
    expect(next.find((g) => g.id === "done")).toBeUndefined();
  });

  it("preserves declaration order among the groups that remain", () => {
    const next = pruneEmptyGroups(GROUPS, [
      { id: "E", groupId: "done" },
      { id: "C", groupId: "prog" },
    ]);
    expect(next.map((g) => g.id)).toEqual(["prog", "done"]);
  });

  it("returns an empty array when no workspace references any group", () => {
    const next = pruneEmptyGroups(GROUPS, [{ id: "A" }]);
    expect(next).toEqual([]);
  });
});

describe("reconcileGroupsAfterMove", () => {
  // Regression (task-768): moving a workspace to a brand-new group emptied
  // that same group instead of the one it left, because the caller computed
  // "which groups are still used" from the workspaces array as it stood
  // BEFORE the move (React state hasn't applied it yet at that point). The
  // function must bake the move in itself so a caller can never pass stale data.
  it("keeps the destination group and drops the origin group the move emptied", () => {
    const groups = [{ id: "grp-1", label: "Group" }, { id: "grp-2", label: "Group" }];
    const before = [{ id: "A", groupId: "grp-1" }];
    const next = reconcileGroupsAfterMove(groups, before, "A", "grp-2");
    expect(next.map((g) => g.id)).toEqual(["grp-2"]);
  });

  it("keeps the origin group when another workspace still uses it", () => {
    const groups = [{ id: "grp-1", label: "Group" }, { id: "grp-2", label: "Group" }];
    const before = [{ id: "A", groupId: "grp-1" }, { id: "B", groupId: "grp-1" }];
    const next = reconcileGroupsAfterMove(groups, before, "A", "grp-2");
    expect(next.map((g) => g.id)).toEqual(["grp-1", "grp-2"]);
  });

  it("does not touch groups unrelated to the moved workspace", () => {
    const groups = [{ id: "grp-1", label: "Group" }, { id: "grp-2", label: "Other" }];
    const before = [{ id: "A", groupId: "grp-1" }, { id: "B", groupId: "grp-2" }];
    const next = reconcileGroupsAfterMove(groups, before, "A", null);
    expect(next.map((g) => g.id)).toEqual(["grp-2"]);
  });
});
