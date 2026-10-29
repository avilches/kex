import { CircleIcon } from "@hugeicons/core-free-icons";
import { describe, expect, it } from "vitest";
import {
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
  it("prefers the workspace's own icon, colored or not", () => {
    expect(markGlyph("HeartIcon", true)).toBe(getWorkspaceIcon("HeartIcon"));
    expect(markGlyph("HeartIcon", false)).toBe(getWorkspaceIcon("HeartIcon"));
  });

  it("is a circle when the workspace has a color and no icon", () => {
    expect(markGlyph(undefined, true)).toBe(CircleIcon);
  });

  it("is nothing when the workspace has neither", () => {
    expect(markGlyph(undefined, false)).toBeNull();
  });

  it("is the circle, not nothing, while an icon of the catalog has not loaded", () => {
    expect(markGlyph("NotLoadedYetIcon", true)).toBe(CircleIcon);
    expect(markGlyph("NotLoadedYetIcon", false)).toBeNull();
  });
});
