import { describe, expect, it, vi } from "vitest";

vi.mock("./useTerminalSession", () => ({ isScratchpadOpen: () => false }));

const { holdsScratchpadFocus } = await import("./keepScratchpadFocus");

describe("holdsScratchpadFocus", () => {
  it("holds focus on a primary click while the scratchpad is open", () => {
    expect(holdsScratchpadFocus(0, true)).toBe(true);
  });

  it("lets focus move when the scratchpad is closed", () => {
    expect(holdsScratchpadFocus(0, false)).toBe(false);
  });

  it("leaves right and middle clicks alone", () => {
    expect(holdsScratchpadFocus(2, true)).toBe(false);
    expect(holdsScratchpadFocus(1, true)).toBe(false);
  });
});
