import { describe, expect, it } from "vitest";
import {
  BACKGROUND_MEMORY_REFERENCE_COLS,
  estimateParkedTerminalBudget,
  estimateTerminalBytes,
} from "./backgroundMemoryBudget";

describe("estimateTerminalBytes", () => {
  it("matches xterm's cols * 3 cells * 4 bytes layout at the reference width", () => {
    expect(estimateTerminalBytes(2000)).toBe(
      2000 * BACKGROUND_MEMORY_REFERENCE_COLS * 12,
    );
  });

  it("scales with an explicit width", () => {
    expect(estimateTerminalBytes(1000, 80)).toBe(1000 * 80 * 12);
  });

  it("clamps negative inputs to zero", () => {
    expect(estimateTerminalBytes(-5, 80)).toBe(0);
    expect(estimateTerminalBytes(100, -5)).toBe(0);
  });
});

describe("estimateParkedTerminalBudget", () => {
  it("divides the memory budget by the per-terminal estimate", () => {
    const perTerminal = estimateTerminalBytes(2000);
    expect(estimateParkedTerminalBudget(perTerminal * 6, 2000)).toBe(6);
  });

  it("rounds down a partial terminal's worth of budget", () => {
    const perTerminal = estimateTerminalBytes(2000);
    expect(estimateParkedTerminalBudget(perTerminal * 2.9, 2000)).toBe(2);
  });

  it("is zero when the budget is zero or negative", () => {
    expect(estimateParkedTerminalBudget(0, 2000)).toBe(0);
    expect(estimateParkedTerminalBudget(-1, 2000)).toBe(0);
  });

  it("is zero when scrollback is zero, never a division by zero", () => {
    expect(estimateParkedTerminalBudget(1024 * 1024, 0)).toBe(0);
  });
});
