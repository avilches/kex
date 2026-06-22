import { describe, expect, it } from "vitest";
import { canReuseResolvedRepo } from "./repoReuse";

describe("canReuseResolvedRepo", () => {
  it("reuses when the context path is unchanged", () => {
    expect(canReuseResolvedRepo("/proj", "/proj")).toBe(true);
    expect(canReuseResolvedRepo("/proj/src", "/proj/src")).toBe(true);
  });

  it("does not reuse for a path nested under the resolved context", () => {
    // /proj/wt may be a nested repo/worktree, so the parent repo must not be
    // reused; it has to re-resolve to find the nearest repo.
    expect(canReuseResolvedRepo("/proj/wt", "/proj")).toBe(false);
    expect(canReuseResolvedRepo("/proj/wt/file.ts", "/proj")).toBe(false);
  });

  it("does not reuse before anything has been resolved", () => {
    expect(canReuseResolvedRepo("/proj", null)).toBe(false);
    expect(canReuseResolvedRepo(null, null)).toBe(false);
  });

  it("does not reuse across unrelated paths", () => {
    expect(canReuseResolvedRepo("/a", "/b")).toBe(false);
  });
});
