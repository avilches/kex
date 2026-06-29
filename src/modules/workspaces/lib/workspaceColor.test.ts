import { describe, expect, test } from "vitest";
import {
  WORKSPACE_COLOR_PALETTE,
  idHue,
  initialColorForId,
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
