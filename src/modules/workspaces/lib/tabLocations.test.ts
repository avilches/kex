import { describe, expect, test } from "vitest";
import { sameLocations, tabLocations } from "./tabLocations";

const pane = (id: string, tabIds: string[]) => ({
  kind: "pane" as const,
  id,
  tabs: tabIds.map((t) => ({ id: t })),
  activeTabId: tabIds[0] ?? null,
});

describe("tabLocations", () => {
  test("maps every tab of every pane to its workspace", () => {
    const ws = [
      { id: "w1", paneTree: pane("p1", ["a", "b"]) },
      {
        id: "w2",
        paneTree: {
          kind: "split",
          id: "s",
          first: pane("p2", ["c"]),
          second: pane("p3", ["d"]),
        },
      },
    ];
    expect(tabLocations(ws as never)).toEqual({
      a: "w1",
      b: "w1",
      c: "w2",
      d: "w2",
    });
  });

  test("sameLocations compares by content", () => {
    expect(sameLocations(null, {})).toBe(false);
    expect(sameLocations({ a: "w" }, { a: "w" })).toBe(true);
    expect(sameLocations({ a: "w" }, { a: "x" })).toBe(false);
  });
});
