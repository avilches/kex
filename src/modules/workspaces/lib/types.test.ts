import { describe, expect, it } from "vitest";
import { scratchpadStateOf } from "./types";

describe("scratchpadStateOf", () => {
  it("is hidden when closed regardless of active side", () => {
    expect(scratchpadStateOf(false, false)).toBe("hidden");
    expect(scratchpadStateOf(false, true)).toBe("hidden");
  });

  it("is focused when open and the scratchpad is the active side", () => {
    expect(scratchpadStateOf(true, true)).toBe("focused");
  });

  it("is visible when open but the terminal is the active side", () => {
    expect(scratchpadStateOf(true, false)).toBe("visible");
  });
});
