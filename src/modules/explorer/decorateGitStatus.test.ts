import { describe, expect, it } from "vitest";
import { decorateGitStatus, type Row } from "./FileExplorer";
import type { GitStatusCode } from "./lib/gitStatusUtils";

function entryRow(overrides: Partial<Extract<Row, { kind: "entry" }>> = {}): Row {
  return {
    kind: "entry",
    key: overrides.path ?? "/root/a.ts",
    path: "/root/a.ts",
    name: "a.ts",
    isDir: false,
    isExpanded: false,
    depth: 0,
    gitignored: false,
    gitStatusCode: null,
    ...overrides,
  };
}

describe("decorateGitStatus", () => {
  it("attaches the looked-up code to entry rows", () => {
    const rows: Row[] = [entryRow({ path: "/root/a.ts", key: "/root/a.ts" })];
    const lookup = (path: string): GitStatusCode | null =>
      path === "/root/a.ts" ? "M" : null;

    const result = decorateGitStatus(rows, lookup);

    expect(result[0]).toMatchObject({ path: "/root/a.ts", gitStatusCode: "M" });
  });

  it("never looks up a gitignored row and forces its code to null", () => {
    const rows: Row[] = [
      entryRow({
        path: "/root/node_modules/x.js",
        key: "/root/node_modules/x.js",
        gitignored: true,
        gitStatusCode: null,
      }),
    ];
    let called = false;
    const lookup = (): GitStatusCode | null => {
      called = true;
      return "M";
    };

    const result = decorateGitStatus(rows, lookup);

    expect(called).toBe(false);
    expect(result[0]).toMatchObject({ gitStatusCode: null });
  });

  it("leaves non entry/rename rows untouched", () => {
    const rows: Row[] = [{ kind: "fs-root", key: "fs-root:/root", path: "/root" }];
    const result = decorateGitStatus(rows, () => "M");
    expect(result[0]).toBe(rows[0]);
  });

  // This is the invariant the FileExplorer memo split relies on: a git status
  // snapshot that doesn't change any VISIBLE row's code must not produce a new
  // `rows` array identity, since decorateGitStatus runs on every status
  // change but buildRows (the recursive tree walk) must not.
  it("returns the same array reference when no row's code actually changes", () => {
    const rows: Row[] = [entryRow({ gitStatusCode: "M" })];
    const result = decorateGitStatus(rows, () => "M");
    expect(result).toBe(rows);
  });

  it("returns a new array reference when a row's code changes", () => {
    const rows: Row[] = [entryRow({ gitStatusCode: "M" })];
    const result = decorateGitStatus(rows, () => "A");
    expect(result).not.toBe(rows);
    expect(result[0]).toMatchObject({ gitStatusCode: "A" });
  });

  it("decorates a rename row the same way as an entry row", () => {
    const rows: Row[] = [
      {
        kind: "rename",
        key: "rename:/root/a.ts",
        path: "/root/a.ts",
        name: "a.ts",
        isDir: false,
        depth: 0,
        gitignored: false,
        gitStatusCode: null,
      },
    ];
    const result = decorateGitStatus(rows, () => "D");
    expect(result[0]).toMatchObject({ gitStatusCode: "D" });
  });
});
