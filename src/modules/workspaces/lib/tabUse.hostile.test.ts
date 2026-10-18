import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordTabUse, tabUseSnapshot } from "./tabUse";

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

describe("tab use with a hostile stored value", () => {
  it("drops non-numeric, negative and non-finite stamps instead of returning them", () => {
    localStorage.setItem(
      "kex-tab-use",
      '{"a":"abc","b":null,"c":-5,"d":1e999,"e":42,"f":{"x":1},"g":true}',
    );
    expect(tabUseSnapshot()).toEqual({ e: 42 });
  });

  it("keeps recording after a corrupt stamp was dropped", () => {
    localStorage.setItem("kex-tab-use", '{"a":"abc"}');
    recordTabUse("tab-1", 7);
    expect(tabUseSnapshot()).toEqual({ "tab-1": 7 });
  });

  it("does not pollute Object.prototype through a stored __proto__ key", () => {
    localStorage.setItem("kex-tab-use", '{"__proto__":{"polluted":1},"ok":3}');
    tabUseSnapshot();
    recordTabUse("tab-2", 9);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(tabUseSnapshot().ok).toBe(3);
  });

  it("can record and read a tab whose id is a prototype name", () => {
    recordTabUse("constructor", 5);
    recordTabUse("__proto__", 6);
    const snap = tabUseSnapshot();
    expect(snap.constructor).toBe(5);
    expect(Object.getOwnPropertyDescriptor(snap, "__proto__")?.value).toBe(6);
    expect(({} as Record<string, unknown>).constructor).toBe(Object);
  });
});
