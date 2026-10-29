import { describe, expect, it } from "vitest";
import { formatCpu, formatElapsed, formatMem } from "./metricsFormat";

describe("formatCpu", () => {
  it("renders one decimal", () => {
    expect(formatCpu(18.74)).toBe("18.7%");
  });
  it("clamps to 0..100", () => {
    expect(formatCpu(-3)).toBe("0.0%");
    expect(formatCpu(250)).toBe("100.0%");
  });
});

describe("formatMem", () => {
  it("shows KB under 1 MB", () => {
    expect(formatMem(512 * 1024)).toBe("512 KB");
  });
  it("shows MB rounded", () => {
    expect(formatMem(340 * 1024 * 1024)).toBe("340 MB");
  });
  it("shows GB with one decimal at and above 1024 MB", () => {
    expect(formatMem(1536 * 1024 * 1024)).toBe("1.5 GB");
  });
});

describe("formatElapsed", () => {
  it("shows seconds under a minute", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(59_900)).toBe("59s");
  });
  it("shows minutes and padded seconds under an hour", () => {
    expect(formatElapsed(192_000)).toBe("3m 12s");
    expect(formatElapsed(65_000)).toBe("1m 05s");
  });
  it("shows hours and padded minutes from an hour on", () => {
    expect(formatElapsed(3_600_000 + 7 * 60_000)).toBe("1h 07m");
  });
  it("treats a negative span as zero", () => {
    expect(formatElapsed(-5000)).toBe("0s");
  });
});
