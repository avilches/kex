import { describe, expect, it, vi } from "vitest";
import {
  autoHibernateCandidates,
  autoHibernateDelayMs,
  autoHibernateModes,
  autoHibernateTick,
  parseAutoHibernate,
  touchHiddenSince,
  visibleTabIds,
} from "./autoHibernate";
import type { SplitNode, Tab, Workspace } from "./types";

const MIN = 60_000;

const term = (id: string, asleep = false): Tab => ({
  id,
  kind: "terminal",
  ...(asleep ? { hibernation: { at: 1 } } : {}),
});
const editor = (id: string): Tab => ({ id, kind: "editor", path: `/p/${id}`, dirty: false, preview: false });

const pane = (id: string, tabs: Tab[], activeTabId: string | null): SplitNode => ({ kind: "pane", id, tabs, activeTabId });
const ws = (id: string, tabs: Tab[], activeTabId: string | null = tabs[0]?.id ?? null): Workspace => ({
  id,
  title: id,
  paneTree: pane(`p-${id}`, tabs, activeTabId),
  activePaneId: `p-${id}`,
});

describe("parseAutoHibernate", () => {
  it("defaults to 4h for unknown values", () => {
    expect(parseAutoHibernate(undefined)).toBe("4h");
    expect(parseAutoHibernate("1h")).toBe("4h");
    expect(parseAutoHibernate("off")).toBe("off");
  });
  it("keeps 1m only in dev", () => {
    expect(autoHibernateModes(true)).toContain("1m");
    expect(autoHibernateModes(false)).not.toContain("1m");
    expect(parseAutoHibernate("1m", autoHibernateModes(true))).toBe("1m");
    expect(parseAutoHibernate("1m", autoHibernateModes(false))).toBe("4h");
  });
  it("maps modes to delays", () => {
    expect(autoHibernateDelayMs("1m")).toBe(MIN);
    expect(autoHibernateDelayMs("30m")).toBe(30 * MIN);
    expect(autoHibernateDelayMs("4h")).toBe(240 * MIN);
    expect(autoHibernateDelayMs("2d")).toBe(2880 * MIN);
    expect(autoHibernateDelayMs("off")).toBeNull();
  });
});

describe("visibleTabIds", () => {
  it("is the active tab of every pane of the active workspace", () => {
    const split: SplitNode = {
      kind: "split",
      id: "s",
      orientation: "horizontal",
      dividerPosition: 0.5,
      first: pane("p1", [term("a"), term("b")], "b"),
      second: pane("p2", [term("c")], "c"),
    };
    const w: Workspace = { id: "w", title: "w", paneTree: split, activePaneId: "p1" };
    expect([...visibleTabIds([w, ws("other", [term("z")])], "w")].sort()).toEqual(["b", "c"]);
  });

  it("is empty when there is no active workspace", () => {
    expect(visibleTabIds([ws("a", [term("t")])], null).size).toBe(0);
  });
});

describe("touchHiddenSince", () => {
  it("stamps a hidden tab the first time it is seen and keeps that moment afterwards", () => {
    const stamps = new Map<string, number>();
    const list = [ws("a", [term("t1")]), ws("b", [term("t2")])];
    touchHiddenSince(stamps, list, "a", 100);
    expect(stamps.has("t1")).toBe(false);
    expect(stamps.get("t2")).toBe(100);
    touchHiddenSince(stamps, list, "a", 500);
    expect(stamps.get("t2")).toBe(100);
  });

  it("clears the stamp of a tab that becomes visible and restarts it when it hides again", () => {
    const stamps = new Map<string, number>();
    const list = [ws("a", [term("t1")]), ws("b", [term("t2")])];
    touchHiddenSince(stamps, list, "a", 100);
    touchHiddenSince(stamps, list, "b", 200);
    expect(stamps.has("t2")).toBe(false);
    touchHiddenSince(stamps, list, "a", 300);
    expect(stamps.get("t2")).toBe(300);
  });

  it("treats a non-active tab of the active workspace as hidden", () => {
    const stamps = new Map<string, number>();
    touchHiddenSince(stamps, [ws("a", [term("t1"), term("t2")], "t1")], "a", 100);
    expect(stamps.has("t1")).toBe(false);
    expect(stamps.get("t2")).toBe(100);
  });

  it("renews a hidden tab that is busy so its countdown only runs while nothing works in it", () => {
    const stamps = new Map([["t2", 1]]);
    touchHiddenSince(stamps, [ws("b", [term("t2")])], null, 100, new Set(["t2"]));
    expect(stamps.get("t2")).toBe(100);
  });

  it("forgets tabs that are gone or asleep, and ignores tabs that are not terminals", () => {
    const stamps = new Map([
      ["gone", 1],
      ["asleep", 1],
    ]);
    touchHiddenSince(stamps, [ws("b", [term("asleep", true), editor("e")])], null, 100);
    expect([...stamps]).toEqual([]);
  });
});

describe("autoHibernateCandidates", () => {
  const list = [ws("a", [term("t1")]), ws("b", [term("t2"), term("t3", true), editor("e")]), ws("c", [term("t4")])];
  const stamps = new Map([
    ["t2", 0],
    ["t4", 10 * MIN],
  ]);

  it("picks the hidden awake terminals whose delay elapsed, by workspace", () => {
    expect(autoHibernateCandidates(list, "a", stamps, "30m", 30 * MIN)).toEqual(new Map([["b", ["t2"]]]));
    expect(autoHibernateCandidates(list, "a", stamps, "30m", 40 * MIN)).toEqual(
      new Map([
        ["b", ["t2"]],
        ["c", ["t4"]],
      ]),
    );
  });

  it("never picks a visible tab, even with an old stamp", () => {
    expect(autoHibernateCandidates(list, "b", stamps, "30m", 40 * MIN)).toEqual(new Map([["c", ["t4"]]]));
  });

  it("waits for the delay and skips tabs without a stamp", () => {
    expect(autoHibernateCandidates(list, "a", stamps, "30m", 30 * MIN - 1).size).toBe(0);
    expect(autoHibernateCandidates(list, "b", new Map(), "30m", 1e12).size).toBe(0);
  });

  it("is silent when off", () => {
    expect(autoHibernateCandidates(list, "a", stamps, "off", 1e12).size).toBe(0);
  });
});

describe("autoHibernateTick", () => {
  const list = [ws("a", [term("t1")]), ws("b", [term("t2")])];

  it("stamps first and asks to hibernate what already waited long enough", async () => {
    const stamps = new Map([["t2", 0]]);
    const request = vi.fn(async () => true);
    await autoHibernateTick({ workspaces: list, activeId: "a", stamps, mode: "30m", now: 31 * MIN, request });
    expect(request).toHaveBeenCalledWith("b", ["t2"]);
  });

  it("keeps stamping while a previous run is still working, but asks for nothing", async () => {
    const stamps = new Map<string, number>();
    const request = vi.fn(async () => true);
    await autoHibernateTick({ workspaces: list, activeId: "a", stamps, mode: "30m", now: 5, request, busy: true });
    expect(stamps.get("t2")).toBe(5);
    expect(request).not.toHaveBeenCalled();
  });

  it("never asks for a tab with a busy agent or a running script", async () => {
    const stamps = new Map([["t2", 0]]);
    const request = vi.fn(async () => true);
    await autoHibernateTick({
      workspaces: list,
      activeId: "a",
      stamps,
      busyTabIds: new Set(["t2"]),
      mode: "30m",
      now: 31 * MIN,
      request,
    });
    expect(request).not.toHaveBeenCalled();
    expect(stamps.get("t2")).toBe(31 * MIN);
  });

  it("asks for nothing when off", async () => {
    const request = vi.fn(async () => true);
    await autoHibernateTick({ workspaces: list, activeId: "a", stamps: new Map([["t2", 0]]), mode: "off", now: 1e12, request });
    expect(request).not.toHaveBeenCalled();
  });
});
