import { describe, expect, it } from "vitest";
import { minimumContrastRatioFor } from "./terminalTheme";

describe("minimumContrastRatioFor", () => {
  it("corrects low-contrast colors on a light terminal", () => {
    expect(minimumContrastRatioFor("light")).toBe(4.5);
  });

  it("leaves the palette untouched on a dark terminal", () => {
    expect(minimumContrastRatioFor("dark")).toBe(1);
  });
});
