import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_STATE,
  sanitizeSidebarState,
} from "./sidebarState";

describe("sanitizeSidebarState view parsing", () => {
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
    expect(sanitizeSidebarState(null).view).toBe(
      DEFAULT_SIDEBAR_STATE.view,
    );
  });
});
