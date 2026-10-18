import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { learnedBoost, learnedSnapshot, recordChoice } from "./learned";

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

describe("learned choices with hostile text", () => {
  it("does not pollute Object.prototype through a typed __proto__", () => {
    recordChoice("__proto__", "cmd:a");
    recordChoice("constructor", "cmd:a");
    expect(({} as Record<string, unknown>).a).toBeUndefined();
    expect(Object.keys(Object.prototype)).toEqual([]);
  });

  it("does not credit an unrelated row when the typed text is a prototype name", () => {
    const snap = learnedSnapshot();
    for (const t of ["constructor", "tostring", "__proto__", "hasownproperty"]) {
      expect(learnedBoost(snap, t, "cmd:a")).toBe(0);
    }
  });

  it("learns and recalls a row key named like a prototype member", () => {
    recordChoice("abc", "constructor");
    recordChoice("abc", "__proto__");
    const snap = learnedSnapshot();
    expect(learnedBoost(snap, "abc", "constructor")).toBeGreaterThan(0);
    expect(({} as Record<string, unknown>).constructor).toBe(Object);
  });

  it("survives a stored object with a __proto__ key", () => {
    localStorage.setItem("kex-palette-learned", '{"__proto__":{"a":3},"ok":{"b":2}}');
    const snap = learnedSnapshot();
    expect(learnedBoost(snap, "ok", "b")).toBeGreaterThan(0);
    expect(({} as Record<string, unknown>).a).toBeUndefined();
  });

  it("handles a very long typed text without growing storage without bound", () => {
    recordChoice("x".repeat(100000), "cmd:a");
    expect(JSON.stringify(learnedSnapshot()).length).toBeLessThan(5000);
  });

  it("keeps at most a bounded number of rows per typed text, keeping the one just chosen", () => {
    for (let i = 0; i < 80; i++) recordChoice("abc", `cmd:r${i}`);
    const rows = learnedSnapshot().abc;
    expect(Object.keys(rows).length).toBeLessThanOrEqual(30);
    expect(rows["cmd:r79"]).toBe(1);
  });

  it("ignores a stored term longer than the limit", () => {
    localStorage.setItem("kex-palette-learned", JSON.stringify({ ["y".repeat(500)]: { a: 3 }, ok: { b: 1 } }));
    const snap = learnedSnapshot();
    expect(Object.keys(snap)).toEqual(["ok"]);
  });
});
