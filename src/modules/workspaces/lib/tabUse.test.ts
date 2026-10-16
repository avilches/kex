import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TAB_USE_MAX_ENTRIES,
  pruneTabUse,
  recordTabUse,
  tabUseSnapshot,
} from "./tabUse";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, String(v));
    },
    removeItem: (k) => {
      m.delete(k);
    },
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

describe("tabUse", () => {
  it("stores the last use per tab", () => {
    recordTabUse("tab-a", 100);
    recordTabUse("tab-b", 200);
    recordTabUse("tab-a", 300);
    expect(tabUseSnapshot()).toEqual({ "tab-a": 300, "tab-b": 200 });
  });

  it("keeps only the most recent entries past the cap", () => {
    for (let i = 0; i < TAB_USE_MAX_ENTRIES + 5; i++) recordTabUse(`tab-${i}`, i + 1);
    const snap = tabUseSnapshot();
    expect(Object.keys(snap)).toHaveLength(TAB_USE_MAX_ENTRIES);
    expect(snap["tab-0"]).toBeUndefined();
    expect(snap[`tab-${TAB_USE_MAX_ENTRIES + 4}`]).toBe(TAB_USE_MAX_ENTRIES + 5);
  });

  it("prunes ids that are no longer alive", () => {
    recordTabUse("tab-a", 1);
    recordTabUse("tab-b", 2);
    pruneTabUse(new Set(["tab-b"]));
    expect(tabUseSnapshot()).toEqual({ "tab-b": 2 });
  });

  it("reads corrupt JSON as empty", () => {
    localStorage.setItem("kex-tab-use", "{not json");
    expect(tabUseSnapshot()).toEqual({});
  });

  it("reads a non-object value as empty", () => {
    localStorage.setItem("kex-tab-use", "[1,2]");
    expect(tabUseSnapshot()).toEqual({});
  });

  it("does not throw when localStorage is inaccessible", () => {
    vi.spyOn(store, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(store, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => recordTabUse("tab-a", 1)).not.toThrow();
    expect(tabUseSnapshot()).toEqual({});
    expect(() => pruneTabUse(new Set())).not.toThrow();
  });
});
