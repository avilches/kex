import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_STATE,
  sanitizeSidebarState,
} from "./sidebarState";

describe("sanitizeSidebarState", () => {
  it("falls back to defaults when given null or undefined", () => {
    expect(sanitizeSidebarState(null)).toEqual(DEFAULT_SIDEBAR_STATE);
    expect(sanitizeSidebarState(undefined)).toEqual(DEFAULT_SIDEBAR_STATE);
  });

  it("coerces an invalid view to 'explorer'", () => {
    expect(sanitizeSidebarState({ view: "bogus" as never }).view).toBe("explorer");
  });

  it("coerces an invalid side to 'left'", () => {
    expect(sanitizeSidebarState({ side: "sideways" as never }).side).toBe("left");
  });

  it("keeps valid view and side values", () => {
    const out = sanitizeSidebarState({ view: "git", side: "right" });
    expect(out.view).toBe("git");
    expect(out.side).toBe("right");
  });

  it("preserves a boolean open flag and defaults non-booleans", () => {
    expect(sanitizeSidebarState({ open: false }).open).toBe(false);
    expect(sanitizeSidebarState({ open: "yes" as never }).open).toBe(
      DEFAULT_SIDEBAR_STATE.open,
    );
  });

  it("clamps width within 12..70 and defaults non-numbers", () => {
    expect(sanitizeSidebarState({ width: 5 }).width).toBe(12);
    expect(sanitizeSidebarState({ width: 80 }).width).toBe(70);
    expect(sanitizeSidebarState({ width: 30 }).width).toBe(30);
    expect(sanitizeSidebarState({ width: "wide" as never }).width).toBe(
      DEFAULT_SIDEBAR_STATE.width,
    );
  });
});
