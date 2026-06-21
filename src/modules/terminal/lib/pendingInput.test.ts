import { describe, expect, it } from "vitest";

import {
  boundedPendingInput,
  PENDING_INPUT_MAX,
} from "./useTerminalSession";

describe("boundedPendingInput", () => {
  it("appends input that fits under the cap", () => {
    expect(boundedPendingInput("", "ls")).toBe("ls");
    expect(boundedPendingInput("ls", " -la\r")).toBe("ls -la\r");
  });

  it("appends right up to the cap", () => {
    const current = "a".repeat(PENDING_INPUT_MAX - 1);
    expect(boundedPendingInput(current, "b")).toBe(current + "b");
  });

  it("drops the whole append when it would overflow the cap", () => {
    const current = "a".repeat(PENDING_INPUT_MAX);
    expect(boundedPendingInput(current, "b")).toBe(current);
  });

  it("does not partially truncate an overflowing append", () => {
    const current = "a".repeat(PENDING_INPUT_MAX - 2);
    expect(boundedPendingInput(current, "bbbb")).toBe(current);
  });
});
