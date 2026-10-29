import { describe, expect, test } from "vitest";
import {
  WORKSPACE_COLOR_PALETTE,
  idHue,
  initialColorForId,
  chipColorOnWhite,
  resolveWorkspaceColor,
  workspaceDisplayColor,
} from "./workspaceColor";

describe("workspaceDisplayColor", () => {
  test("a workspace without a root shows no automatic color", () => {
    expect(workspaceDisplayColor({ id: "ws-1", color: undefined })).toBeNull();
    expect(workspaceDisplayColor({ id: "ws-1", color: null })).toBeNull();
  });

  test("a workspace without a root keeps the color the user picked", () => {
    expect(workspaceDisplayColor({ id: "ws-1", color: "#112233" })).toBe("#112233");
  });

  test("a workspace with a root resolves the automatic color", () => {
    expect(workspaceDisplayColor({ id: "ws-1", color: undefined, workspaceRoot: "/a" })).toBe(
      initialColorForId("ws-1"),
    );
    expect(workspaceDisplayColor({ id: "ws-1", color: null, workspaceRoot: "/a" })).toBeNull();
  });
});

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

describe("chipColorOnWhite", () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const contrastWithWhite = (hex: string) => 1.05 / (lum(hex) + 0.05);

  test("a color that already reaches 4.5 with white is unchanged", () => {
    expect(chipColorOnWhite("#1e3a8a")).toBe("#1e3a8a");
    expect(chipColorOnWhite("#6d28d9")).toBe("#6d28d9");
  });
  test("a lighter color is darkened until white reaches 4.5", () => {
    const out = chipColorOnWhite("#ec4899");
    expect(out).not.toBe("#ec4899");
    expect(contrastWithWhite(out)).toBeGreaterThanOrEqual(4.5);
    expect(contrastWithWhite(out)).toBeLessThan(4.7);
  });
  test("darkening keeps the hue: the strongest channel stays the strongest", () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(chipColorOnWhite("#ec4899").slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b!);
    expect(b).toBeGreaterThan(g!);
  });
  test("every palette color reaches 4.5 with white", () => {
    for (const bg of WORKSPACE_COLOR_PALETTE) {
      expect(contrastWithWhite(chipColorOnWhite(bg))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
