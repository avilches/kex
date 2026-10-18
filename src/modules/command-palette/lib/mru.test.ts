import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mruRank, mruSnapshot, recordUse } from "./mru";

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

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe("mru", () => {
  it("records and ranks by last use", () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(10).mockReturnValueOnce(20);
    recordUse("a");
    recordUse("b");
    const snap = mruSnapshot();
    expect(mruRank(snap, "b")).toBeGreaterThan(mruRank(snap, "a"));
    expect(mruRank(snap, "zzz")).toBe(0);
  });

  it("treats every non-object stored value as empty", () => {
    for (const raw of ["null", "5", '"x"', "[1,2]", "true", "{bad"]) {
      localStorage.setItem("kex-palette-mru", raw);
      expect(Object.keys(mruSnapshot())).toEqual([]);
      expect(() => recordUse("a")).not.toThrow();
      localStorage.clear();
    }
  });

  it("drops stamps that are not positive finite numbers, so sorting stays consistent", () => {
    localStorage.setItem("kex-palette-mru", '{"a":"x","b":-1,"c":null,"d":9}');
    const snap = mruSnapshot();
    expect(mruRank(snap, "a")).toBe(0);
    expect(mruRank(snap, "d")).toBe(9);
  });

  it("can rank an action whose id is a prototype name", () => {
    expect(mruRank(mruSnapshot(), "constructor")).toBe(0);
    expect(mruRank(mruSnapshot(), "__proto__")).toBe(0);
  });
});
