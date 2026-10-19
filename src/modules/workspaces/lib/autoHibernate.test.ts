import { describe, expect, it } from "vitest";
import {
  autoHibernateCandidates,
  autoHibernateDelayMs,
  autoHibernateModes,
  autoHibernateTick,
  hibernatedIds,
  parseAutoHibernate,
  seedActivity,
  stampSwitch,
  touchActivity,
  withActivity,
} from "./autoHibernate";
import type { Workspace } from "./types";

const ws = (id: string, over: Partial<Workspace> = {}) =>
  ({ id, ...over }) as Workspace;
const MIN = 60_000;

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

describe("touchActivity", () => {
  it("renews a workspace with a busy agent even when it is not the active one", () => {
    const seen = new Map([
      ["a", 1],
      ["b", 1],
    ]);
    touchActivity(
      seen,
      [ws("a"), ws("b")],
      null,
      100,
      new Set(),
      new Set(["b"]),
    );
    expect(seen.get("a")).toBe(1);
    expect(seen.get("b")).toBe(100);
  });

  it("stamps the active workspace and first sightings, and forgets removed ones", () => {
    const seen = new Map([
      ["a", 1],
      ["gone", 2],
    ]);
    touchActivity(seen, [ws("a"), ws("b"), ws("c")], "b", 100, new Set());
    expect(seen.get("a")).toBe(1);
    expect(seen.get("b")).toBe(100);
    expect(seen.get("c")).toBe(100);
    expect(seen.has("gone")).toBe(false);
  });
  it("restarts the clock of a workspace when it is hibernated or woken, not on every tick", () => {
    const stamps = new Map([["h", 1]]);
    const seen = new Set<string>();
    const asleep = [ws("h", { hibernated: true }), ws("a")];
    touchActivity(stamps, asleep, "a", 100, seen);
    expect(stamps.get("h")).toBe(100);
    touchActivity(stamps, asleep, "a", 200, seen);
    expect(stamps.get("h")).toBe(100);
    touchActivity(stamps, [ws("h"), ws("a")], "a", 300, seen);
    expect(stamps.get("h")).toBe(300);
  });
  it("does not renew an active workspace that is hibernated", () => {
    const stamps = new Map([["h", 1]]);
    touchActivity(
      stamps,
      [ws("h", { hibernated: true })],
      "h",
      100,
      new Set(["h"]),
    );
    expect(stamps.get("h")).toBe(1);
  });
});

describe("autoHibernateCandidates", () => {
  const seen = new Map([
    ["a", 0],
    ["b", 0],
    ["c", 0],
  ]);
  const all = [ws("a"), ws("b"), ws("c", { hibernated: true })];

  it("picks idle workspaces, never the active or hibernated ones", () => {
    expect(autoHibernateCandidates(all, "a", seen, "30m", 30 * MIN)).toEqual([
      "b",
    ]);
  });
  it("waits for the delay", () => {
    expect(
      autoHibernateCandidates(all, "a", seen, "30m", 30 * MIN - 1),
    ).toEqual([]);
  });
  it("is silent when off", () => {
    expect(autoHibernateCandidates(all, "a", seen, "off", 1e12)).toEqual([]);
  });
});

describe("persisted activity", () => {
  it("seeds stamps from the saved workspaces and skips those without one", () => {
    const stamps = seedActivity([ws("a", { lastActiveAt: 5 }), ws("b")], 100);
    expect([...stamps]).toEqual([["a", 5]]);
  });
  it("makes a restarted workspace due when its saved stamp is old enough", () => {
    const list = [ws("a"), ws("b", { lastActiveAt: 0 })];
    const stamps = seedActivity(list, 4 * 60 * MIN);
    touchActivity(stamps, list, "a", 4 * 60 * MIN, new Set());
    expect(
      autoHibernateCandidates(list, "a", stamps, "4h", 4 * 60 * MIN),
    ).toEqual(["b"]);
  });
  it("stamps a workspace without a saved stamp with now, so it is not due", () => {
    const list = [ws("a"), ws("b")];
    const stamps = seedActivity(list, 1000);
    touchActivity(stamps, list, "a", 1000, new Set());
    expect(stamps.get("b")).toBe(1000);
    expect(autoHibernateCandidates(list, "a", stamps, "30m", 1000)).toEqual([]);
  });
  it("renews the workspace that was active at startup even with an old stamp", () => {
    const list = [ws("a", { lastActiveAt: 0 }), ws("b", { lastActiveAt: 0 })];
    const stamps = seedActivity(list, 1e12);
    touchActivity(stamps, list, "a", 1e12, new Set());
    expect(stamps.get("a")).toBe(1e12);
    expect(autoHibernateCandidates(list, "a", stamps, "30m", 1e12)).toEqual([
      "b",
    ]);
  });
  it("keeps a hibernated workspace out of the candidates", () => {
    const list = [ws("a"), ws("h", { hibernated: true, lastActiveAt: 0 })];
    const stamps = seedActivity(list, 1e12);
    touchActivity(stamps, list, "a", 1e12, hibernatedIds(list));
    expect(autoHibernateCandidates(list, "a", stamps, "30m", 1e12)).toEqual([]);
  });
  it("returns none when the mode is off", () => {
    const list = [ws("a"), ws("b", { lastActiveAt: 0 })];
    expect(
      autoHibernateCandidates(list, "a", seedActivity(list, 1e12), "off", 1e12),
    ).toEqual([]);
  });
  it("merges live stamps into the bodies to persist without touching the others", () => {
    const a = ws("a");
    const b = ws("b");
    const out = withActivity([a, b], new Map([["a", 7]]));
    expect(out[0]!.lastActiveAt).toBe(7);
    expect(out[1]).toBe(b);
  });
});

describe("stamp validation", () => {
  const bad = (v: unknown) => ws("a", { lastActiveAt: v as number });
  it("ignores null, string and NaN stamps", () => {
    for (const v of [null, "5", NaN, Infinity, undefined]) {
      expect(seedActivity([bad(v)], 100).has("a")).toBe(false);
    }
  });
  it("clamps a future stamp to now so the workspace can still become due", () => {
    const stamps = seedActivity([bad(1e15), ws("b", { lastActiveAt: 7 })], 100);
    expect(stamps.get("a")).toBe(100);
    expect(stamps.get("b")).toBe(7);
  });
  it("does not write a non-finite live stamp into a body", () => {
    const a = ws("a");
    expect(withActivity([a], new Map([["a", NaN]]))[0]).toBe(a);
  });
});

describe("stampSwitch", () => {
  it("stamps the workspace left and the one entered, except hibernated ones", () => {
    const stamps = new Map<string, number>();
    stampSwitch(
      stamps,
      [ws("a"), ws("b"), ws("h", { hibernated: true })],
      "a",
      "b",
      50,
    );
    expect([...stamps].sort()).toEqual([
      ["a", 50],
      ["b", 50],
    ]);
    stampSwitch(stamps, [ws("a"), ws("h", { hibernated: true })], "a", "h", 60);
    expect(stamps.get("h")).toBeUndefined();
    expect(stamps.get("a")).toBe(60);
  });
});

describe("autoHibernateTick", () => {
  const run = (
    list: Workspace[],
    stamps: Map<string, number>,
    seen: Set<string>,
    now: number,
    over = {},
  ) => {
    const requested: string[] = [];
    const saved: number[] = [];
    const promise = autoHibernateTick({
      workspaces: list,
      activeId: "a",
      stamps,
      hibernatedSeen: seen,
      mode: "4h",
      now,
      save: () => saved.push(now),
      request: async (id) => {
        requested.push(id);
        return true;
      },
      ...over,
    });
    return promise.then(() => ({ requested, saved }));
  };

  it("at startup renews the active workspace and makes an old non-active one due", async () => {
    const list = [ws("a", { lastActiveAt: 0 }), ws("b", { lastActiveAt: 0 })];
    const now = 5 * 60 * MIN;
    const stamps = seedActivity(list, now);
    const { requested, saved } = await run(
      list,
      stamps,
      hibernatedIds(list),
      now,
    );
    expect(stamps.get("a")).toBe(now);
    expect(requested).toEqual(["b"]);
    expect(saved).toEqual([now]);
  });
  it("renews and saves but requests nothing while a previous run is busy", async () => {
    const list = [ws("a"), ws("b", { lastActiveAt: 0 })];
    const stamps = seedActivity(list, 1e12);
    const { requested, saved } = await run(list, stamps, new Set(), 1e12, {
      busy: true,
    });
    expect(requested).toEqual([]);
    expect(saved).toHaveLength(1);
  });
  it("persists an identical hibernated body on consecutive ticks", async () => {
    const list = [ws("a"), ws("h", { hibernated: true })];
    const stamps = seedActivity(list, 1000);
    const seen = hibernatedIds(list);
    await run(list, stamps, seen, 1000);
    const first = withActivity(list, stamps)[1];
    await run(list, stamps, seen, 61_000);
    const second = withActivity(list, stamps)[1];
    expect(second).toEqual(first);
    expect(withActivity(list, stamps)[0]!.lastActiveAt).toBe(61_000);
  });
});

describe("tick persistence with mode off", () => {
  const steady = [ws("a", { lastActiveAt: 0 }), ws("b", { lastActiveAt: 0 })];
  const now = 5 * 60 * MIN;
  const prepared = () => {
    const stamps = seedActivity(steady, now);
    return { stamps, seen: hibernatedIds(steady) };
  };
  const runOff = async (
    list: Workspace[],
    stamps: Map<string, number>,
    seen: Set<string>,
    at: number,
    mode: "off" | "30m",
  ) => {
    const saved: number[] = [];
    const requested: string[] = [];
    await autoHibernateTick({
      workspaces: list,
      activeId: "a",
      stamps,
      hibernatedSeen: seen,
      mode,
      now: at,
      save: () => saved.push(at),
      request: async (id) => {
        requested.push(id);
        return true;
      },
    });
    return { saved, requested };
  };

  it("writes nothing while the workspace set and sleep states stand still", async () => {
    const { stamps, seen } = prepared();
    const one = await runOff(steady, stamps, seen, now, "off");
    const two = await runOff(steady, stamps, seen, now + MIN, "off");
    expect(one.saved).toEqual([]);
    expect(two.saved).toEqual([]);
  });

  it("writes when a workspace appears and when one crosses the sleep boundary", async () => {
    const { stamps, seen } = prepared();
    const appeared = await runOff(
      [...steady, ws("c")],
      stamps,
      seen,
      now,
      "off",
    );
    expect(appeared.saved).toEqual([now]);
    const snoozed = [
      ws("a", { lastActiveAt: 0 }),
      ws("b", { hibernated: true }),
    ];
    const transition = await runOff(snoozed, stamps, seen, now + MIN, "off");
    expect(transition.saved).toEqual([now + MIN]);
  });

  it("keeps saving each tick when the mode is on", async () => {
    const { stamps, seen } = prepared();
    const one = await runOff(steady, stamps, seen, now, "30m");
    const two = await runOff(steady, stamps, seen, now + MIN, "30m");
    expect(one.saved).toEqual([now]);
    expect(two.saved).toEqual([now + MIN]);
    expect(one.requested).toContain("b");
  });
});
