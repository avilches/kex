import { describe, expect, it } from "vitest";
import {
  groupDropId,
  groupWorkspaces,
  groupWorkspacesForDrag,
  parseGroupDropId,
  statusIdFromGroupId,
  visibleWorkspaceOrder,
} from "./workspaceOrder";

type WS = { id: string; statusId?: string };

const STATUSES = [
  { id: "prog", label: "In progress" },
  { id: "done", label: "Done" },
];

// State order intentionally interleaves groups, the way it ends up after the
// user assigns statuses without reordering: A,B have no status, C,D are prog,
// E,F are done, but they are scattered in the array.
const WS: WS[] = [
  { id: "A" },
  { id: "C", statusId: "prog" },
  { id: "B" },
  { id: "E", statusId: "done" },
  { id: "D", statusId: "prog" },
  { id: "F", statusId: "done" },
];

describe("groupWorkspaces", () => {
  it("puts the no-status group first, then each status in declaration order", () => {
    const groups = groupWorkspaces(WS, STATUSES);
    expect(groups.map((g) => g.id)).toEqual(["__none__", "prog", "done"]);
    expect(groups.map((g) => g.items.map((w) => w.id))).toEqual([
      ["A", "B"],
      ["C", "D"],
      ["E", "F"],
    ]);
  });

  it("omits empty groups and treats unknown statusId as no-status", () => {
    const groups = groupWorkspaces([{ id: "X", statusId: "ghost" }], STATUSES);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: "__none__", items: [{ id: "X" }] });
  });
});

describe("groupWorkspacesForDrag", () => {
  it("keeps the no-status group and every status, even when empty", () => {
    const groups = groupWorkspacesForDrag([{ id: "A", statusId: "prog" }], STATUSES);
    expect(groups.map((g) => g.id)).toEqual(["__none__", "prog", "done"]);
    expect(groups.map((g) => g.items.map((w) => w.id))).toEqual([[], ["A"], []]);
  });

  it("routes unknown statusId into the always-present no-status group", () => {
    const groups = groupWorkspacesForDrag([{ id: "X", statusId: "ghost" }], STATUSES);
    expect(groups[0]).toMatchObject({ id: "__none__", items: [{ id: "X" }] });
  });
});

describe("group drop id helpers", () => {
  it("round-trips a group id and rejects plain item ids", () => {
    expect(parseGroupDropId(groupDropId("prog"))).toBe("prog");
    expect(parseGroupDropId("ws-123")).toBeNull();
  });

  it("maps the no-status group to a null status", () => {
    expect(statusIdFromGroupId("__none__")).toBeNull();
    expect(statusIdFromGroupId("prog")).toBe("prog");
  });
});

describe("visibleWorkspaceOrder", () => {
  it("matches visual order regardless of state-array order (the navigation bug)", () => {
    const order = visibleWorkspaceOrder(WS, STATUSES, new Set(), "A");
    expect(order.map((w) => w.id)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("drops hidden members of a collapsed group, keeping only its active one", () => {
    const order = visibleWorkspaceOrder(WS, STATUSES, new Set(["prog"]), "C");
    // prog is collapsed and C is active: C stays, D is hidden.
    expect(order.map((w) => w.id)).toEqual(["A", "B", "C", "E", "F"]);
  });

  it("drops a collapsed group entirely when its active member is elsewhere", () => {
    const order = visibleWorkspaceOrder(WS, STATUSES, new Set(["prog"]), "A");
    expect(order.map((w) => w.id)).toEqual(["A", "B", "E", "F"]);
  });

  it("never collapses the no-status group", () => {
    const order = visibleWorkspaceOrder(WS, STATUSES, new Set(["__none__"]), "A");
    expect(order.map((w) => w.id)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });
});
