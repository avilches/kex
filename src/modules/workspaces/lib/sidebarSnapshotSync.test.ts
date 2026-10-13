// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExplorerSnapshot } from "./sidebarSnapshot";
import {
  pushSidebarSnapshot,
  startSidebarSnapshotSync,
  withSidebarSnapshotFlush,
} from "./sidebarSnapshotSync";

const snap = (selectedPath: string): ExplorerSnapshot => ({
  expanded: [],
  selectedPath,
  scroll: null,
});

describe("withSidebarSnapshotFlush", () => {
  let stop: (() => void) | null = null;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    stop?.();
    stop = null;
    vi.useRealTimers();
  });

  it("applies the pending snapshot before the wrapped change runs", () => {
    const calls: string[] = [];
    stop = startSidebarSnapshotSync((batch) => {
      calls.push(`apply ${batch.get("ws-a")?.selectedPath}`);
    });
    pushSidebarSnapshot("ws-a", snap("/p/old"));
    pushSidebarSnapshot("ws-a", snap("/p/new"));
    expect(calls).toEqual(["apply /p/old"]);

    const setSide = withSidebarSnapshotFlush((side: "left" | "right") => {
      calls.push(`side ${side}`);
    });
    setSide("left");
    expect(calls).toEqual(["apply /p/old", "apply /p/new", "side left"]);
  });

  it("just runs the change when nothing is pending", () => {
    const apply = vi.fn();
    stop = startSidebarSnapshotSync(apply);
    const fn = vi.fn();
    withSidebarSnapshotFlush(fn)(true);
    expect(fn).toHaveBeenCalledWith(true);
    expect(apply).not.toHaveBeenCalled();
  });
});
