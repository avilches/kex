import { describe, expect, test } from "vitest";
import { isBulkClosable } from "./tabClose";
import type { Tab } from "./types";

describe("isBulkClosable", () => {
  test("locked terminal tabs are protected from bulk close", () => {
    const tab: Tab = { id: "t1", kind: "terminal", locked: true };
    expect(isBulkClosable(tab)).toBe(false);
  });

  test("unlocked terminal tabs can be bulk closed", () => {
    const tab: Tab = { id: "t2", kind: "terminal", locked: false };
    expect(isBulkClosable(tab)).toBe(true);
  });

  test("terminal tabs without an explicit lock flag can be bulk closed", () => {
    const tab: Tab = { id: "t3", kind: "terminal" };
    expect(isBulkClosable(tab)).toBe(true);
  });

  test("locked editor and git-diff tabs are protected from bulk close", () => {
    const editor: Tab = { id: "e1", kind: "editor", path: "/a.ts", dirty: false, preview: false, locked: true };
    const gitDiff: Tab = { id: "g1", kind: "git-diff", path: "a.ts", repoRoot: "/r", mode: "+", originalPath: null, locked: true };
    expect(isBulkClosable(editor)).toBe(false);
    expect(isBulkClosable(gitDiff)).toBe(false);
  });

  test("unlocked lockable tabs and non-lockable tabs are always bulk closable", () => {
    const editor: Tab = { id: "e2", kind: "editor", path: "/a.ts", dirty: false, preview: false };
    const gitDiff: Tab = { id: "g2", kind: "git-diff", path: "a.ts", repoRoot: "/r", mode: "+", originalPath: null };
    const browser: Tab = { id: "p1", kind: "browser", url: "http://localhost" };
    const markdown: Tab = { id: "m1", kind: "markdown", path: "/a.md" };
    expect(isBulkClosable(editor)).toBe(true);
    expect(isBulkClosable(gitDiff)).toBe(true);
    expect(isBulkClosable(browser)).toBe(true);
    expect(isBulkClosable(markdown)).toBe(true);
  });
});
