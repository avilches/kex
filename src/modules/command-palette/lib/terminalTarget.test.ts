import { describe, expect, it } from "vitest";
import type { MergedRow } from "./mergeRows";
import { terminalTargetOf } from "./terminalTarget";
import type { TabEntry } from "./tabEntries";

const tab = (tabId: string, cwd: string): MergedRow => ({
  kind: "tab",
  key: `tab:${tabId}`,
  entry: { tabId, cwd } as TabEntry,
});

describe("terminalTargetOf", () => {
  const rows = [tab("a", "/work/a"), tab("b", "")];

  it("returns the highlighted tab", () => {
    expect(terminalTargetOf("tab:a", rows)?.cwd).toBe("/work/a");
  });

  it("is null for a tab without a folder", () => {
    expect(terminalTargetOf("tab:b", rows)).toBeNull();
  });

  it("is null for a value that is not a visible tab", () => {
    expect(terminalTargetOf("tab:zzz", rows)).toBeNull();
    expect(terminalTargetOf("cmd:x", rows)).toBeNull();
  });
});
