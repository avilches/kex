import { describe, expect, it } from "vitest";
import { groupWorkspaces, visibleWorkspaceOrder } from "./workspaceOrder";

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
