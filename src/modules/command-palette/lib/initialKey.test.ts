import { describe, expect, it } from "vitest";
import { initialKey } from "./initialKey";
import type { MergedRow } from "./mergeRows";

const tab = (id: string, current = false) =>
  ({ kind: "tab", key: `tab:${id}`, entry: {}, current }) as unknown as MergedRow;
const ws = (id: string) => ({ kind: "workspace", key: `ws:${id}` }) as unknown as MergedRow;
const closed = (id: string) => ({ kind: "closed", key: `closed:${id}` }) as unknown as MergedRow;
const cmd = (id: string, group: string) =>
  ({ kind: "command", key: `cmd:${id}`, item: { group } }) as unknown as MergedRow;

describe("initialKey", () => {
  it("is the current tab, before the recent ones", () => {
    expect(initialKey([tab("cur", true), tab("a"), tab("b")], false, [])).toBe("tab:cur");
  });

  it("is the first row drawn when there is no current tab", () => {
    expect(initialKey([tab("a"), tab("b")], false, [])).toBe("tab:a");
    expect(initialKey([cmd("x", "Git"), closed("c")], false, ["Git"])).toBe("closed:c");
  });

  it("skips the workspace rows the idle list does not draw", () => {
    expect(initialKey([ws("x"), cmd("x", "Git")], false, ["Git"])).toBe("cmd:x");
    expect(initialKey([ws("x")], false, [])).toBe("");
  });

  it("is empty without rows", () => {
    expect(initialKey([], false, [])).toBe("");
  });

  it("is the first ranked row while typing", () => {
    expect(initialKey([tab("cur", true), tab("a")], true, [])).toBe("tab:cur");
    expect(initialKey([ws("x"), tab("a")], true, [])).toBe("ws:x");
  });
});
