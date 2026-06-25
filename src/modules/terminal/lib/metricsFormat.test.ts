import { describe, expect, it } from "vitest";
import { formatCpu, formatMem } from "./metricsFormat";

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
