import { describe, expect, it } from "vitest";
import {
  ancestorListingPending,
  shouldClearSelection,
  type ParentListingStatus,
} from "./staleSelection";

describe("shouldClearSelection", () => {
  it("keeps a restored selection while its parent listing is loading", () => {
    expect(shouldClearSelection(false, "loading", false)).toBe(false);
    expect(shouldClearSelection(false, "idle", false)).toBe(false);
  });

  it("clears a selection from the old root after an in-session root change", () => {
    expect(shouldClearSelection(false, undefined, false)).toBe(true);
  });

  it("clears a selection whose parent folder was deleted or failed to list", () => {
    expect(shouldClearSelection(false, undefined, true)).toBe(true);
    expect(shouldClearSelection(false, "error", true)).toBe(true);
  });

  it("clears a missing row once every folder in the chain is loaded", () => {
    expect(shouldClearSelection(false, "loaded", false)).toBe(true);
  });

  it("keeps it when the parent is loaded but an ancestor listing is still pending", () => {
    expect(shouldClearSelection(false, "loaded", true)).toBe(false);
  });

  it("never clears a visible selection", () => {
    expect(shouldClearSelection(true, "loaded", false)).toBe(false);
    expect(shouldClearSelection(true, undefined, false)).toBe(false);
  });
});

describe("ancestorListingPending", () => {
  const statuses =
    (map: Record<string, ParentListingStatus>) =>
    (path: string): ParentListingStatus =>
      map[path];

  it("is pending while the root is loading", () => {
    expect(
      ancestorListingPending("/p", "/p/a/b/c.ts", statuses({ "/p": "loading", "/p/a": "loaded", "/p/a/b": "loaded" })),
    ).toBe(true);
  });

  it("is pending while an intermediate folder is loading even if the parent finished first", () => {
    expect(
      ancestorListingPending("/p", "/p/a/b/c.ts", statuses({ "/p": "loaded", "/p/a": "loading", "/p/a/b": "loaded" })),
    ).toBe(true);
    expect(
      ancestorListingPending("/p", "/p/a/b/c.ts", statuses({ "/p": "loaded", "/p/a": "idle", "/p/a/b": "loaded" })),
    ).toBe(true);
  });

  it("is settled when the whole chain is loaded", () => {
    expect(
      ancestorListingPending("/p", "/p/a/b/c.ts", statuses({ "/p": "loaded", "/p/a": "loaded", "/p/a/b": "loaded" })),
    ).toBe(false);
  });

  it("is never pending for a selection outside the root or without a root", () => {
    expect(ancestorListingPending("/q", "/p/a.ts", statuses({ "/q": "loading" }))).toBe(false);
    expect(ancestorListingPending(null, "/p/a.ts", statuses({}))).toBe(false);
  });
});
