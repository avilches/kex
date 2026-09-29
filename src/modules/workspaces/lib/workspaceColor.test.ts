import { describe, expect, test } from "vitest";
import {
  WORKSPACE_COLOR_PALETTE,
  idHue,
  initialColorForId,
  readableTextOn,
  resolveWorkspaceColor,
} from "./workspaceColor";

describe("idHue", () => {
  test("returns 0-359", () => {
    const h = idHue("abc");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });
  test("same id always same hue", () => {
    expect(idHue("fixed-id")).toBe(idHue("fixed-id"));
  });
});

describe("initialColorForId", () => {
  test("returns a palette color", () => {
    const color = initialColorForId("some-workspace-id");
    expect(WORKSPACE_COLOR_PALETTE).toContain(color);
  });
});

describe("resolveWorkspaceColor", () => {
  test("null -> no color", () => {
    expect(resolveWorkspaceColor(null, "id")).toBeNull();
  });
  test("undefined -> palette color from id", () => {
    const c = resolveWorkspaceColor(undefined, "id");
    expect(WORKSPACE_COLOR_PALETTE).toContain(c);
  });
  test("hex string -> returned as-is", () => {
    expect(resolveWorkspaceColor("#ff0000", "id")).toBe("#ff0000");
  });
});

describe("readableTextOn", () => {
  test("dark colors keep white text", () => {
    expect(readableTextOn("#1e3a8a")).toBe("#ffffff");
    expect(readableTextOn("#6d28d9")).toBe("#ffffff");
  });
  test("light and mid-tone colors get black text", () => {
    expect(readableTextOn("#eab308")).toBe("#000000");
    expect(readableTextOn("#22c55e")).toBe("#000000");
    expect(readableTextOn("#ec4899")).toBe("#000000");
  });
  test("every palette color reaches 4.5 contrast", () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const v = parseInt(hex.slice(i, i + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    for (const bg of WORKSPACE_COLOR_PALETTE) {
      const a = lum(bg);
      const b = lum(readableTextOn(bg));
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});
