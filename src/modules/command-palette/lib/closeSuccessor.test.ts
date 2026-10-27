import { describe, expect, it } from "vitest";
import { displayOrder, successorKey } from "./closeSuccessor";
import type { MergedRow } from "./mergeRows";

const tabRow = (id: string, current = false) =>
  ({ kind: "tab", key: `tab:${id}`, entry: {}, current }) as unknown as MergedRow;
const cmdRow = (id: string, group: string) =>
  ({ kind: "command", key: `cmd:${id}`, item: { group } }) as unknown as MergedRow;
const closedRow = (id: string) =>
  ({ kind: "closed", key: `closed:${id}` }) as unknown as MergedRow;
const keysOf = (rows: MergedRow[]) => rows.map((r) => r.key);

describe("successorKey", () => {
  const rows = [tabRow("a"), tabRow("b"), tabRow("c")];

  it("picks the row below", () => {
    expect(successorKey(rows, "tab:a")).toBe("tab:b");
    expect(successorKey(rows, "tab:b")).toBe("tab:c");
  });

  it("picks the row above when it was the last", () => {
    expect(successorKey(rows, "tab:c")).toBe("tab:b");
  });

  it("is null for the only row or an unknown key", () => {
    expect(successorKey([tabRow("a")], "tab:a")).toBeNull();
    expect(successorKey([], "tab:a")).toBeNull();
    expect(successorKey(rows, "tab:zz")).toBeNull();
  });
});

describe("displayOrder", () => {
  it("keeps the rank order while typing", () => {
    const rows = [tabRow("c", true), cmdRow("x", "G"), tabRow("a")];
    expect(keysOf(displayOrder(rows, true, ["G"]))).toEqual(keysOf(rows));
  });

  it("regroups the idle list the way MergedList draws it", () => {
    const rows = [
      cmdRow("x", "B"),
      tabRow("a"),
      cmdRow("y", "A"),
      closedRow("k"),
      tabRow("c", true),
    ];
    expect(keysOf(displayOrder(rows, false, ["A", "B"]))).toEqual([
      "tab:c",
      "tab:a",
      "closed:k",
      "cmd:y",
      "cmd:x",
    ]);
  });

  it("makes the first row below the last tab the successor of that tab", () => {
    const rows = [cmdRow("y", "A"), tabRow("a"), closedRow("k")];
    const ordered = displayOrder(rows, false, ["A"]);
    expect(successorKey(ordered, "tab:a")).toBe("closed:k");
  });

  it("falls back to the commands when the last tab is the only row before them", () => {
    const ordered = displayOrder([cmdRow("y", "A"), tabRow("a")], false, ["A"]);
    expect(successorKey(ordered, "tab:a")).toBe("cmd:y");
  });
});
