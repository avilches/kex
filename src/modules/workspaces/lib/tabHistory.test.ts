import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab } from "./types";

type TouchEntry = { kind: string; path: string; workspaceId: string; count: number };

const nativeMocks = vi.hoisted(() => ({
  touch: vi.fn((_entries: TouchEntry[]) => Promise.resolve()),
  record: vi.fn((_kind: string, _path: string, _workspaceId: string) => Promise.resolve()),
  list: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/lib/native", () => ({
  native: {
    tabHistoryTouch: nativeMocks.touch,
    tabHistoryRecord: nativeMocks.record,
    tabHistoryList: nativeMocks.list,
  },
}));

import { flushTabUses, noteTabUse, recordTabClosed, tabIdentity, tabIdentityKey } from "./tabHistory";

const terminal = (cwd: string) => ({ kind: "terminal", cwd }) as Tab;
const file = (path: string) => ({ kind: "editor", path }) as Tab;

beforeEach(async () => {
  await flushTabUses();
  nativeMocks.touch.mockClear();
  nativeMocks.record.mockClear();
  nativeMocks.list.mockClear();
});

describe("tabIdentity", () => {
  it("uses the terminal cwd and the editor path, normalized to forward slashes", () => {
    expect(tabIdentity(terminal("/work/a/"))).toEqual({ kind: "terminal", path: "/work/a" });
    expect(tabIdentity(file("C:\\work\\a.ts"))).toEqual({ kind: "file", path: "C:/work/a.ts" });
  });

  it("ignores views without a stable location", () => {
    expect(tabIdentity({ kind: "browser", url: "https://x" } as Tab)).toBeNull();
    expect(tabIdentityKey(terminal(""))).toBeNull();
  });
});

describe("noteTabUse", () => {
  it("batches counts per location into a single write", async () => {
    noteTabUse(terminal("/work/a"), "ws-1");
    noteTabUse(terminal("/work/a/"), "ws-1");
    noteTabUse(file("/work/a/x.ts"), "ws-2");
    await flushTabUses();

    expect(nativeMocks.touch).toHaveBeenCalledTimes(1);
    const entries = nativeMocks.touch.mock.calls[0][0];
    expect(entries).toEqual(
      expect.arrayContaining([
        { kind: "terminal", path: "/work/a", workspaceId: "ws-1", count: 2 },
        { kind: "file", path: "/work/a/x.ts", workspaceId: "ws-2", count: 1 },
      ]),
    );
  });

  it("does not write anything when no location was noted", async () => {
    await flushTabUses();
    expect(nativeMocks.touch).not.toHaveBeenCalled();
  });

  it("writes at most once every ten seconds while tabs keep changing", async () => {
    vi.useFakeTimers();
    try {
      noteTabUse(terminal("/work/a"), "ws-1");
      await vi.advanceTimersByTimeAsync(5_000);
      noteTabUse(terminal("/work/a"), "ws-1");
      await vi.advanceTimersByTimeAsync(4_999);
      expect(nativeMocks.touch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(nativeMocks.touch).toHaveBeenCalledTimes(1);
      expect(nativeMocks.touch.mock.calls[0][0]).toEqual([
        { kind: "terminal", path: "/work/a", workspaceId: "ws-1", count: 2 },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("recordTabClosed", () => {
  it("flushes pending uses before recording the location", async () => {
    noteTabUse(terminal("/work/a"), "ws-1");
    recordTabClosed(terminal("/work/a"), "ws-1");
    await vi.waitFor(() => expect(nativeMocks.record).toHaveBeenCalledWith("terminal", "/work/a", "ws-1"));
    expect(nativeMocks.touch).toHaveBeenCalledTimes(1);
  });
});
