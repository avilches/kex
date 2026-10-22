import { describe, expect, it } from "vitest";
import { collapseContext, diffLines } from "./lineDiff";

const kinds = (before: string, after: string) =>
  diffLines(before, after).map((l) => `${l.kind}:${l.text}`);

describe("diffLines", () => {
  it("marks a new file as all additions", () => {
    expect(kinds("", "a\nb\n")).toEqual(["add:a", "add:b"]);
  });

  it("marks a deleted file as all removals", () => {
    expect(kinds("a\nb\n", "")).toEqual(["del:a", "del:b"]);
  });

  it("keeps unchanged lines and reports only the inserted ones", () => {
    expect(kinds("{\n  \"a\": 1\n}\n", "{\n  \"a\": 1,\n  \"b\": 2\n}\n")).toEqual([
      "same:{",
      "del:  \"a\": 1",
      "add:  \"a\": 1,",
      "add:  \"b\": 2",
      "same:}",
    ]);
  });

  it("returns only unchanged lines for identical text", () => {
    expect(diffLines("x\ny\n", "x\ny\n").every((l) => l.kind === "same")).toBe(true);
  });

  it("finds the common lines between two edits in the middle", () => {
    expect(kinds("a\nb\nc\nd\n", "a\nc\nx\nd\n")).toEqual([
      "same:a",
      "del:b",
      "same:c",
      "add:x",
      "same:d",
    ]);
  });
});

describe("collapseContext", () => {
  it("folds long unchanged runs into a gap and keeps the lines around a change", () => {
    const lines = diffLines(
      Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n"),
      Array.from({ length: 20 }, (_, i) => (i === 10 ? "changed" : `l${i}`)).join("\n"),
    );
    const rows = collapseContext(lines, 2);
    expect(rows[0]).toEqual({ kind: "gap", hidden: 8 });
    expect(rows[rows.length - 1]).toEqual({ kind: "gap", hidden: 7 });
    expect(rows.filter((r) => r.kind !== "gap")).toHaveLength(6);
  });

  it("shows everything when nothing is far from a change", () => {
    const rows = collapseContext(diffLines("a\nb", "a\nc"), 3);
    expect(rows.some((r) => r.kind === "gap")).toBe(false);
  });
});
