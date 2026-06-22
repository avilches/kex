import { describe, expect, test } from "vitest";
import { isBulkClosable } from "./panelClose";
import type { Panel } from "./types";

describe("isBulkClosable", () => {
  test("locked terminal tabs are protected from bulk close", () => {
    const panel: Panel = { id: "t1", kind: "terminal", locked: true };
    expect(isBulkClosable(panel)).toBe(false);
  });

  test("unlocked terminal tabs can be bulk closed", () => {
    const panel: Panel = { id: "t2", kind: "terminal", locked: false };
    expect(isBulkClosable(panel)).toBe(true);
  });

  test("terminal tabs without an explicit lock flag can be bulk closed", () => {
    const panel: Panel = { id: "t3", kind: "terminal" };
    expect(isBulkClosable(panel)).toBe(true);
  });

  test("locked editor and git-diff tabs are protected from bulk close", () => {
    const editor: Panel = { id: "e1", kind: "editor", path: "/a.ts", dirty: false, preview: false, locked: true };
    const gitDiff: Panel = { id: "g1", kind: "git-diff", path: "a.ts", repoRoot: "/r", mode: "+", originalPath: null, locked: true };
    expect(isBulkClosable(editor)).toBe(false);
    expect(isBulkClosable(gitDiff)).toBe(false);
  });

  test("unlocked lockable tabs and non-lockable panels are always bulk closable", () => {
    const editor: Panel = { id: "e2", kind: "editor", path: "/a.ts", dirty: false, preview: false };
    const gitDiff: Panel = { id: "g2", kind: "git-diff", path: "a.ts", repoRoot: "/r", mode: "+", originalPath: null };
    const browser: Panel = { id: "p1", kind: "browser", url: "http://localhost" };
    const markdown: Panel = { id: "m1", kind: "markdown", path: "/a.md" };
    expect(isBulkClosable(editor)).toBe(true);
    expect(isBulkClosable(gitDiff)).toBe(true);
    expect(isBulkClosable(browser)).toBe(true);
    expect(isBulkClosable(markdown)).toBe(true);
  });
});
