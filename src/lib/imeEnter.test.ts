import { describe, expect, it } from "vitest";
import { isImeComposing } from "./imeEnter";

describe("isImeComposing", () => {
  it("detects composition via isComposing", () => {
    expect(isImeComposing({ isComposing: true })).toBe(true);
  });

  it("detects composition via keyCode 229 even when isComposing is not yet set", () => {
    expect(isImeComposing({ isComposing: false, keyCode: 229 })).toBe(true);
    expect(isImeComposing({ keyCode: 229 })).toBe(true);
  });

  it("does not fire for plain key events", () => {
    expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false);
    expect(isImeComposing({})).toBe(false);
  });
});
