import { describe, expect, it } from "vitest";
import type { TabHistoryRecord } from "@/modules/workspaces/lib/tabHistory";
import type { Workspace } from "@/modules/workspaces/lib/types";
import type { TabEntry } from "./tabEntries";
import { buildClosedTabEntries } from "./closedEntries";

const record = (path: string, over: Partial<TabHistoryRecord> = {}): TabHistoryRecord => ({
  kind: "terminal",
  path,
  workspaceId: "ws-1",
  uses: 0,
  lastUsedAt: 0,
  ...over,
});

const workspace = (id: string, over: Partial<Workspace> = {}): Workspace =>
  ({ id, title: `Workspace ${id}`, paneTree: null, activePaneId: "p", ...over }) as Workspace;

const liveTab = (over: Partial<TabEntry>): TabEntry => ({ kind: "terminal", cwd: "", detail: "", ...over }) as TabEntry;

const title = (ws: Workspace) => `title:${ws.id}`;

describe("buildClosedTabEntries", () => {
  it("carries the root of the workspace it belonged to, the file system root when it has none", () => {
    const out = buildClosedTabEntries(
      [record("/a", { workspaceId: "ws-1" }), record("/b", { workspaceId: "ws-2" }), record("/c", { workspaceId: "ws-3" })],
      [
        workspace("ws-1", { workspaceRoot: "/w" }),
        workspace("ws-2", { fsRoot: "/fs" } as Partial<Workspace>),
        workspace("ws-3"),
      ],
      [],
      title,
    );
    expect(out.map((e) => e.workspaceRoot)).toEqual(["/w", "/fs", null]);
  });

  it("skips an entry whose location is already open, whatever its kind", () => {
    const records = [
      record("/work/api"),
      record("/work/api/x.ts", { kind: "file" }),
      record("/work/ui"),
    ];
    const tabs = [
      liveTab({ kind: "terminal", cwd: "/work/api" }),
      liveTab({ kind: "editor", detail: "/work/api/x.ts" }),
    ];
    const out = buildClosedTabEntries(records, [workspace("ws-1")], tabs, title);
    expect(out.map((e) => e.path)).toEqual(["/work/ui"]);
  });

  it("dedupes repeated locations, keeping the most used one first", () => {
    const out = buildClosedTabEntries(
      [record("/work/a", { uses: 1 }), record("/work/a", { uses: 4 })],
      [workspace("ws-1")],
      [],
      title,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.uses).toBe(4);
  });

  it("names the row after the last segment and keeps the full path as detail", () => {
    const out = buildClosedTabEntries([record("/work/api/")], [workspace("ws-1")], [], title);
    expect(out[0]?.title).toBe("api");
    expect(out[0]?.detail).toBe("/work/api/");
  });

  it("drops the entries of workspaces that are not in this window", () => {
    const out = buildClosedTabEntries(
      [record("/work/api", { workspaceId: "other-window" }), record("/work/ui")],
      [workspace("ws-1")],
      [],
      title,
    );
    expect(out.map((e) => e.path)).toEqual(["/work/ui"]);
  });

  it("sorts by uses, then by last use", () => {
    const out = buildClosedTabEntries(
      [
        record("/a", { lastUsedAt: 1 }),
        record("/b", { uses: 1 }),
        record("/c", { lastUsedAt: 5 }),
      ],
      [workspace("ws-1")],
      [],
      title,
    );
    expect(out.map((e) => e.path)).toEqual(["/b", "/c", "/a"]);
  });
});
