import { describe, expect, it } from "vitest";
import {
  autoHibernateCandidates,
  autoHibernateDelayMs,
  parseAutoHibernate,
  seedActivity,
  touchActivity,
  withActivity,
} from "./autoHibernate";
import type { Workspace } from "./types";

const ws = (id: string, over: Partial<Workspace> = {}) => ({ id, ...over }) as Workspace;
const MIN = 60_000;

describe("parseAutoHibernate", () => {
  it("defaults to 4h for unknown values", () => {
    expect(parseAutoHibernate(undefined)).toBe("4h");
    expect(parseAutoHibernate("1h")).toBe("4h");
    expect(parseAutoHibernate("off")).toBe("off");
  });
  it("maps modes to delays", () => {
    expect(autoHibernateDelayMs("30m")).toBe(30 * MIN);
    expect(autoHibernateDelayMs("4h")).toBe(240 * MIN);
    expect(autoHibernateDelayMs("2d")).toBe(2880 * MIN);
    expect(autoHibernateDelayMs("off")).toBeNull();
  });
});

describe("touchActivity", () => {
  it("stamps the active workspace and first sightings, and forgets removed ones", () => {
    const seen = new Map([["a", 1], ["gone", 2]]);
    touchActivity(seen, [ws("a"), ws("b"), ws("c")], "b", 100);
    expect(seen.get("a")).toBe(1);
    expect(seen.get("b")).toBe(100);
    expect(seen.get("c")).toBe(100);
    expect(seen.has("gone")).toBe(false);
  });
  it("restarts the clock of a hibernated workspace so waking it does not re-hibernate it", () => {
    const seen = new Map([["h", 1]]);
    touchActivity(seen, [ws("h", { hibernated: true }), ws("a")], "a", 100);
    expect(seen.get("h")).toBe(100);
  });
});

describe("autoHibernateCandidates", () => {
  const seen = new Map([["a", 0], ["b", 0], ["c", 0]]);
  const all = [ws("a"), ws("b"), ws("c", { hibernated: true })];

  it("picks idle workspaces, never the active or hibernated ones", () => {
    expect(autoHibernateCandidates(all, "a", seen, "30m", 30 * MIN)).toEqual(["b"]);
  });
  it("waits for the delay", () => {
    expect(autoHibernateCandidates(all, "a", seen, "30m", 30 * MIN - 1)).toEqual([]);
  });
  it("is silent when off", () => {
    expect(autoHibernateCandidates(all, "a", seen, "off", 1e12)).toEqual([]);
  });
});

describe("persisted activity", () => {
  it("seeds stamps from the saved workspaces and skips those without one", () => {
    const stamps = seedActivity([ws("a", { lastActiveAt: 5 }), ws("b")]);
    expect([...stamps]).toEqual([["a", 5]]);
  });
  it("makes a restarted workspace due when its saved stamp is old enough", () => {
    const list = [ws("a"), ws("b", { lastActiveAt: 0 })];
    const stamps = seedActivity(list);
    touchActivity(stamps, list, "a", 4 * 60 * MIN);
    expect(autoHibernateCandidates(list, "a", stamps, "4h", 4 * 60 * MIN)).toEqual(["b"]);
  });
  it("stamps a workspace without a saved stamp with now, so it is not due", () => {
    const list = [ws("a"), ws("b")];
    const stamps = seedActivity(list);
    touchActivity(stamps, list, "a", 1000);
    expect(stamps.get("b")).toBe(1000);
    expect(autoHibernateCandidates(list, "a", stamps, "30m", 1000)).toEqual([]);
  });
  it("renews the workspace that was active at startup even with an old stamp", () => {
    const list = [ws("a", { lastActiveAt: 0 }), ws("b", { lastActiveAt: 0 })];
    const stamps = seedActivity(list);
    touchActivity(stamps, list, "a", 1e12);
    expect(stamps.get("a")).toBe(1e12);
    expect(autoHibernateCandidates(list, "a", stamps, "30m", 1e12)).toEqual(["b"]);
  });
  it("keeps a hibernated workspace out of the candidates and restarts its clock", () => {
    const list = [ws("a"), ws("h", { hibernated: true, lastActiveAt: 0 })];
    const stamps = seedActivity(list);
    touchActivity(stamps, list, "a", 1e12);
    expect(stamps.get("h")).toBe(1e12);
    expect(autoHibernateCandidates(list, "a", stamps, "30m", 1e12)).toEqual([]);
  });
  it("returns none when the mode is off", () => {
    const list = [ws("a"), ws("b", { lastActiveAt: 0 })];
    expect(autoHibernateCandidates(list, "a", seedActivity(list), "off", 1e12)).toEqual([]);
  });
  it("merges live stamps into the bodies to persist without touching the others", () => {
    const a = ws("a");
    const b = ws("b");
    const out = withActivity([a, b], new Map([["a", 7]]));
    expect(out[0]!.lastActiveAt).toBe(7);
    expect(out[1]).toBe(b);
  });
});
