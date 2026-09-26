import { describe, expect, it } from "vitest";
import { shouldApplyReload } from "./reloadPlan";

describe("shouldApplyReload", () => {
  it("applies a clean reload", () => {
    expect(shouldApplyReload(false, false)).toBe(true);
  });

  it("skips a dirty reload unless forced", () => {
    expect(shouldApplyReload(false, true)).toBe(false);
  });

  it("always applies a forced reload, dirty or not", () => {
    expect(shouldApplyReload(true, true)).toBe(true);
    expect(shouldApplyReload(true, false)).toBe(true);
  });
});
