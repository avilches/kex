import { describe, expect, it } from "vitest";
import { isDirtyDocument } from "./dirtyTab";
import type { Tab } from "./types";

describe("isDirtyDocument", () => {
  it("is true for an editor or a markdown tab with unsaved changes", () => {
    expect(isDirtyDocument({ id: "a", kind: "editor", path: "/a.ts", dirty: true, preview: false })).toBe(true);
    expect(isDirtyDocument({ id: "b", kind: "markdown", path: "/b.md", dirty: true } as Tab)).toBe(true);
  });

  it("is false for a saved file, a terminal or nothing", () => {
    expect(isDirtyDocument({ id: "a", kind: "editor", path: "/a.ts", dirty: false, preview: false })).toBe(false);
    expect(isDirtyDocument({ id: "t", kind: "terminal" })).toBe(false);
    expect(isDirtyDocument(null)).toBe(false);
    expect(isDirtyDocument(undefined)).toBe(false);
  });
});
