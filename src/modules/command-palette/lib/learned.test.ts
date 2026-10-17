import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEARNED_MAX_ENTRIES, learnedBoost, learnedSnapshot, recordChoice } from "./learned";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

let store: Storage;
beforeEach(() => {
  store = memoryStorage();
  vi.stubGlobal("localStorage", store);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("learned choices", () => {
  it("counts how often a row was chosen after typing a term", () => {
    recordChoice("ser", "cmd:settings.open");
    recordChoice("ser", "cmd:settings.open");
    recordChoice("ser", "cmd:search.focus");
    const snap = learnedSnapshot();
    expect(learnedBoost(snap, "ser", "cmd:settings.open")).toBeGreaterThan(learnedBoost(snap, "ser", "cmd:search.focus"));
    expect(learnedBoost(snap, "ser", "cmd:search.focus")).toBeGreaterThan(0);
    expect(learnedBoost(snap, "ser", "cmd:other")).toBe(0);
  });

  it("is case and whitespace insensitive", () => {
    recordChoice("  SER ", "a");
    expect(learnedBoost(learnedSnapshot(), "ser", "a")).toBeGreaterThan(0);
  });

  it("ignores an empty term", () => {
    recordChoice("   ", "a");
    expect(learnedSnapshot()).toEqual({});
    expect(learnedBoost(learnedSnapshot(), "", "a")).toBe(0);
  });

  it("lets a longer term inherit what a prefix learned, less than an exact match", () => {
    recordChoice("ser", "a");
    const snap = learnedSnapshot();
    const exact = learnedBoost(snap, "ser", "a");
    const longer = learnedBoost(snap, "serv", "a");
    expect(longer).toBeGreaterThan(0);
    expect(longer).toBeLessThan(exact);
    expect(learnedBoost(snap, "se", "a")).toBe(0);
  });

  it("grows with each use but saturates", () => {
    for (let i = 0; i < 50; i++) recordChoice("ser", "a");
    const b50 = learnedBoost(learnedSnapshot(), "ser", "a");
    for (let i = 0; i < 500; i++) recordChoice("ser", "a");
    expect(learnedBoost(learnedSnapshot(), "ser", "a")).toBeLessThanOrEqual(b50 * 1.5);
  });

  it("keeps the storage bounded", () => {
    for (let i = 0; i < LEARNED_MAX_ENTRIES + 20; i++) recordChoice(`term${i}`, "a");
    expect(Object.keys(learnedSnapshot()).length).toBeLessThanOrEqual(LEARNED_MAX_ENTRIES);
  });

  it("survives corrupt or inaccessible storage", () => {
    store.setItem("kex-palette-learned", "{nope");
    expect(learnedSnapshot()).toEqual({});
    vi.spyOn(store, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => recordChoice("ser", "a")).not.toThrow();
  });

  it("drops non-numeric counts", () => {
    store.setItem("kex-palette-learned", JSON.stringify({ ser: { a: "x", b: 2 } }));
    const snap = learnedSnapshot();
    expect(learnedBoost(snap, "ser", "a")).toBe(0);
    expect(learnedBoost(snap, "ser", "b")).toBeGreaterThan(0);
  });
});
