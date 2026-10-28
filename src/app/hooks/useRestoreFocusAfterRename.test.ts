import { describe, expect, it } from "vitest";
import { shouldRestoreFocus } from "./useRestoreFocusAfterRename";

describe("shouldRestoreFocus", () => {
  const body = {} as Element;
  const other = {} as Element;

  it("restores when nothing holds the focus", () => {
    expect(shouldRestoreFocus(null, body, 0)).toBe(true);
    expect(shouldRestoreFocus(body, body, 0)).toBe(true);
  });

  it("restores after a keyboard close even if some element kept the focus", () => {
    expect(shouldRestoreFocus(other, body, Number.POSITIVE_INFINITY)).toBe(true);
    expect(shouldRestoreFocus(other, body, 5000)).toBe(true);
  });

  it("keeps the control the user just clicked", () => {
    expect(shouldRestoreFocus(other, body, 50)).toBe(false);
  });
});
