import { describe, expect, it } from "vitest";
import { sidebarChipColor, tabTopLineColor } from "./tabColor";

describe("sidebarChipColor", () => {
  it("prefers the workspace color over the tab color", () => {
    expect(sidebarChipColor("#111111", "#222222")).toBe("#111111");
  });
  it("falls back to the tab color when the workspace has none", () => {
    expect(sidebarChipColor(null, "#222222")).toBe("#222222");
  });
  it("is null when neither has a color", () => {
    expect(sidebarChipColor(null, undefined)).toBeNull();
  });
});

describe("tabTopLineColor", () => {
  it("prefers the tab color, then the workspace color, then the theme default", () => {
    expect(tabTopLineColor("#222222", "#111111")).toBe("#222222");
    expect(tabTopLineColor(undefined, "#111111")).toBe("#111111");
    expect(tabTopLineColor(undefined, null)).toBeNull();
  });
});
