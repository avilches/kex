import { describe, expect, it } from "vitest";
import { PALETTE_PAGE_SIZE, WORKSPACE_ICON_PALETTE, getWorkspaceIcon } from "./workspaceIcon";

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
