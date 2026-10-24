import { describe, expect, it } from "vitest";
import type { ClosedTabEntry } from "./closedEntries";
import type { MergedRow } from "./mergeRows";
import type { TabEntry } from "./tabEntries";
import { terminalTargetOf } from "./terminalTarget";

const tab = (tabId: string, cwd: string): MergedRow => ({
  kind: "tab",
  key: `tab:${tabId}`,
  entry: { tabId, cwd, workspaceId: "ws", hibernated: false } as TabEntry,
});

const closed = (kind: "terminal" | "file", path: string): MergedRow => ({
  kind: "closed",
  key: `closed:${kind}:${path}`,
  entry: { kind, path, key: `closed:${kind}:${path}`, workspaceId: "ws2", hibernated: true } as ClosedTabEntry,
});

describe("terminalTargetOf", () => {
  it("has no folder for the rows that are not a tab or a closed entry", () => {
    const others = [
      { kind: "command", key: "cmd:x" },
      { kind: "action", key: "act:x" },
      { kind: "workspace", key: "ws:x" },
    ] as MergedRow[];
    for (const row of others) expect(terminalTargetOf(row.key, others)).toBeNull();
  });

  const rows = [
    tab("a", "/work/a"),
    tab("b", ""),
    closed("terminal", "/old/dir"),
    closed("file", "/old/dir/file.md"),
  ];

  it("returns the highlighted tab with the tab to sit beside", () => {
    expect(terminalTargetOf("tab:a", rows)).toEqual({
      cwd: "/work/a",
      workspaceId: "ws",
      hibernated: false,
      besideTabId: "a",
    });
  });

  it("is null for a tab without a folder", () => {
    expect(terminalTargetOf("tab:b", rows)).toBeNull();
  });

  it("uses the folder of a closed terminal and the parent of a closed file", () => {
    expect(terminalTargetOf("closed:terminal:/old/dir", rows)?.cwd).toBe("/old/dir");
    expect(terminalTargetOf("closed:file:/old/dir/file.md", rows)).toMatchObject({
      cwd: "/old/dir",
      workspaceId: "ws2",
      besideTabId: null,
    });
  });

  it("is null for a value that is not a visible row", () => {
    expect(terminalTargetOf("tab:zzz", rows)).toBeNull();
    expect(terminalTargetOf("cmd:x", rows)).toBeNull();
  });
});
