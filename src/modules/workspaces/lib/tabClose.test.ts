import { describe, expect, test } from "vitest";
import { bulkClosableIds, closeIdsForTab, isBulkClosable, otherBulkClosableIds, paneTabCountForTab } from "./tabClose";
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
    const gitDiff: Tab = { id: "g1", kind: "git-diff", path: "a.ts", repoRoot: "/r", mode: "+", originalPath: null, preview: false, locked: true };
    expect(isBulkClosable(editor)).toBe(false);
    expect(isBulkClosable(gitDiff)).toBe(false);
  });

  test("unlocked lockable tabs and non-lockable tabs are always bulk closable", () => {
    const editor: Tab = { id: "e2", kind: "editor", path: "/a.ts", dirty: false, preview: false };
    const gitDiff: Tab = { id: "g2", kind: "git-diff", path: "a.ts", repoRoot: "/r", mode: "+", originalPath: null, preview: false };
    const browser: Tab = { id: "p1", kind: "browser", url: "http://localhost" };
    const markdown: Tab = { id: "m1", kind: "markdown", path: "/a.md" };
    expect(isBulkClosable(editor)).toBe(true);
    expect(isBulkClosable(gitDiff)).toBe(true);
    expect(isBulkClosable(browser)).toBe(true);
    expect(isBulkClosable(markdown)).toBe(true);
  });
});

describe("bulk close selection", () => {
  const tabs: Tab[] = [
    { id: "a", kind: "terminal" },
    { id: "b", kind: "terminal", locked: true },
    { id: "c", kind: "browser", url: "http://localhost" },
  ];

  test("bulkClosableIds skips locked tabs", () => {
    expect(bulkClosableIds(tabs)).toEqual(["a", "c"]);
  });

  test("otherBulkClosableIds also skips the kept tab", () => {
    expect(otherBulkClosableIds(tabs, "a")).toEqual(["c"]);
    expect(otherBulkClosableIds(tabs, "b")).toEqual(["a", "c"]);
  });
});

describe("closeIdsForTab", () => {
  const pane = (id: string, tabs: Tab[]) => ({ kind: "pane" as const, id, tabs, activeTabId: tabs[0]?.id ?? null });
  const term = (id: string, locked?: boolean): Tab => ({ id, kind: "terminal", locked });
  const workspaces = [
    { paneTree: pane("p1", [term("a"), term("b", true), term("c")]) },
    {
      paneTree: {
        kind: "split" as const,
        id: "s",
        orientation: "horizontal" as const,
        dividerPosition: 50,
        first: pane("p2", [term("d"), term("e")]),
        second: pane("p3", [term("f")]),
      },
    },
  ];

  test("closes the rest of the pane that holds the tab, skipping locked ones", () => {
    expect(closeIdsForTab(workspaces, "a")).toEqual(["c"]);
  });

  test("finds the pane in a workspace other than the first and inside a split", () => {
    expect(closeIdsForTab(workspaces, "e")).toEqual(["d"]);
    expect(closeIdsForTab(workspaces, "f")).toEqual([]);
  });

  test("a missing tab closes nothing", () => {
    expect(closeIdsForTab(workspaces, "nope")).toEqual([]);
    expect(closeIdsForTab([], "a")).toEqual([]);
  });

  test("paneTabCountForTab counts the tabs of the holding pane, 0 when missing", () => {
    expect(paneTabCountForTab(workspaces, "b")).toBe(3);
    expect(paneTabCountForTab(workspaces, "f")).toBe(1);
    expect(paneTabCountForTab(workspaces, "nope")).toBe(0);
  });
});
