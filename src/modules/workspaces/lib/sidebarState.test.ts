import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_STATE,
  sanitizeSidebarState,
} from "./sidebarState";

describe("sanitizeSidebarState", () => {
  // Defaults and null/undefined input
  it("falls back to defaults when given null or undefined", () => {
    expect(sanitizeSidebarState(null)).toEqual(DEFAULT_SIDEBAR_STATE);
    expect(sanitizeSidebarState(undefined)).toEqual(DEFAULT_SIDEBAR_STATE);
  });

  // View parsing
  it("keeps explorer", () => {
    expect(sanitizeSidebarState({ view: "explorer" }).view).toBe("explorer");
  });

  it("keeps git", () => {
    expect(sanitizeSidebarState({ view: "git" }).view).toBe("git");
  });

  it("keeps history (regression: parseView used to drop it)", () => {
    expect(sanitizeSidebarState({ view: "history" }).view).toBe("history");
  });

  it("keeps notes", () => {
    expect(sanitizeSidebarState({ view: "notes" }).view).toBe("notes");
  });

  it("falls back to explorer for unknown values", () => {
    expect(
      sanitizeSidebarState({ view: "bogus" as never }).view,
    ).toBe("explorer");
    expect(sanitizeSidebarState({ view: undefined }).view).toBe("explorer");
  });

  // Side validation
  it("coerces an invalid side to 'left'", () => {
    expect(sanitizeSidebarState({ side: "sideways" as never }).side).toBe("left");
  });

  // Full object validation
  it("keeps valid view and side values", () => {
    const out = sanitizeSidebarState({ view: "git", side: "right" });
    expect(out.view).toBe("git");
    expect(out.side).toBe("right");
  });

  // Open flag validation
  it("preserves a boolean open flag and defaults non-booleans", () => {
    expect(sanitizeSidebarState({ open: false }).open).toBe(false);
    expect(sanitizeSidebarState({ open: "yes" as never }).open).toBe(
      DEFAULT_SIDEBAR_STATE.open,
    );
  });

  // Width validation
  it("clamps width within 12..70 and defaults non-numbers", () => {
    expect(sanitizeSidebarState({ width: 5 }).width).toBe(12);
    expect(sanitizeSidebarState({ width: 80 }).width).toBe(70);
    expect(sanitizeSidebarState({ width: 30 }).width).toBe(30);
    expect(sanitizeSidebarState({ width: "wide" as never }).width).toBe(
      DEFAULT_SIDEBAR_STATE.width,
    );
  });
});
