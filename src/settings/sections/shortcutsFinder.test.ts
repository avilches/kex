import { describe, expect, it } from "vitest";
import { finderEmptyMessage } from "./shortcutsFinder";

describe("finderEmptyMessage", () => {
  it("says nothing while there are rows to show", () => {
    expect(finderEmptyMessage(2, 2)).toBeNull();
    expect(finderEmptyMessage(3, 1)).toBeNull();
  });

  it("says no shortcut uses the keys only when none does", () => {
    expect(finderEmptyMessage(0, 0)).toBe("No shortcut uses these keys.");
  });

  it("does not claim the keys are free when the only hits are shortcuts the list hides", () => {
    expect(finderEmptyMessage(1, 0)).toMatch(/used by a built-in shortcut/);
  });
});
