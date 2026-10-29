import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_ICON,
  PALETTE_PAGE_SIZE,
  WORKSPACE_ICON_PALETTE,
  getWorkspaceIcon,
  markGlyph,
} from "./workspaceIcon";

describe("WORKSPACE_ICON_PALETTE", () => {
  it("starts with heart and star", () => {
    expect(WORKSPACE_ICON_PALETTE[0].name).toBe("HeartIcon");
    expect(WORKSPACE_ICON_PALETTE[1].name).toBe("StarIcon");
  });

  it("fills whole pages and has no duplicate names", () => {
    expect(WORKSPACE_ICON_PALETTE.length % PALETTE_PAGE_SIZE).toBe(0);
    const names = WORKSPACE_ICON_PALETTE.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("resolves a name to its icon", () => {
    expect(getWorkspaceIcon("HeartIcon")).not.toBeNull();
    expect(getWorkspaceIcon("Nope")).toBeNull();
  });
});

describe("markGlyph", () => {
  it("prefers the workspace's own icon", () => {
    expect(markGlyph("HeartIcon", "StarIcon")).toBe(getWorkspaceIcon("HeartIcon"));
  });

  it("falls back to the default icon when the workspace has none", () => {
    expect(markGlyph(undefined, "StarIcon")).toBe(getWorkspaceIcon("StarIcon"));
  });

  it("is null, so a color dot is drawn, when the default is empty or unknown", () => {
    expect(markGlyph(undefined, "")).toBeNull();
    expect(markGlyph(undefined, "Nope")).toBeNull();
  });

  it("ships a default that exists in the palette", () => {
    expect(getWorkspaceIcon(DEFAULT_WORKSPACE_ICON)).not.toBeNull();
  });
});
