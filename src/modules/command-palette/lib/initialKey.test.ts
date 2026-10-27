import { describe, expect, it } from "vitest";
import { initialKey } from "./initialKey";
import type { MergedRow } from "./mergeRows";

const tab = (id: string, current = false) =>
  ({ kind: "tab", key: `tab:${id}`, entry: {}, current }) as unknown as MergedRow;
const ws = (id: string) => ({ kind: "workspace", key: `ws:${id}` }) as unknown as MergedRow;

describe("initialKey", () => {
  it("picks the first recent tab over the current one", () => {
    expect(initialKey([tab("cur", true), tab("a"), tab("b")], false)).toBe("tab:a");
  });

  it("falls back to the current tab when there is no other", () => {
    expect(initialKey([tab("cur", true), ws("x")], false)).toBe("tab:cur");
  });

  it("falls back to the first row without tabs, and to empty without rows", () => {
    expect(initialKey([ws("x")], false)).toBe("ws:x");
    expect(initialKey([], false)).toBe("");
  });

  it("leaves the choice to cmdk while typing", () => {
    expect(initialKey([tab("cur", true), tab("a")], true)).toBe("");
  });
});
