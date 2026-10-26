import { describe, expect, it } from "vitest";
import { closeNoticeTitle } from "./closedNotice";
import { captureClosedWorkspace } from "./closedStack";
import type { ClosedEntry, ClosedTabEntry, Workspace } from "./types";

const tabEntry = (id: string, over: Partial<ClosedTabEntry> = {}): ClosedTabEntry => ({
  kind: "tab",
  tab: { id, kind: "terminal" },
  paneId: "p",
  workspaceId: "w",
  prevTabId: null,
  ...over,
});

const emptyWs = (id: string, over: Partial<Workspace> = {}): Workspace => ({
  id,
  title: "",
  paneTree: { kind: "pane", id: `p-${id}`, tabs: [], activeTabId: null },
  activePaneId: `p-${id}`,
  ...over,
});

describe("closeNoticeTitle", () => {
  it("says nothing for an empty stack", () => {
    expect(closeNoticeTitle([])).toBeNull();
  });

  it("names a single tab", () => {
    expect(closeNoticeTitle([tabEntry("t1")])).toBe("Tab closed");
  });

  it("names a workspace", () => {
    const ws: ClosedEntry = { kind: "workspace", workspace: emptyWs("w"), index: 0 };
    expect(closeNoticeTitle([ws])).toBe("Workspace closed");
  });

  it("counts the tabs of one bulk close and ignores older ones", () => {
    const entries = [
      tabEntry("t3", { batchId: "cb-1" }),
      tabEntry("t2", { batchId: "cb-1" }),
      tabEntry("t1", { batchId: "cb-1" }),
      tabEntry("t0", { batchId: "cb-0" }),
      tabEntry("tx"),
    ];
    expect(closeNoticeTitle(entries)).toBe("3 tabs closed");
  });
});

describe("captureClosedWorkspace explicit close", () => {
  it("skips a blank workspace closed by a fold", () => {
    const entries: ClosedEntry[] = [];
    expect(captureClosedWorkspace(entries, emptyWs("w"), 0)).toBe(entries);
  });

  it("records a blank workspace the user closed", () => {
    const next = captureClosedWorkspace([], emptyWs("w"), 2, undefined, true);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ kind: "workspace", index: 2 });
  });

  it("hands the batch of the absorbed last tab to the workspace entry", () => {
    const last = tabEntry("t1", { workspaceId: "w", lastOfWorkspace: true, batchId: "cb-1" });
    const next = captureClosedWorkspace([last, tabEntry("t0", { batchId: "cb-1" })], emptyWs("w"), 0);
    expect(next[0]).toMatchObject({ kind: "workspace", batchId: "cb-1" });
    expect(next).toHaveLength(2);
  });
});
