import { describe, expect, it } from "vitest";
import { canReuseResolvedRepo, isContextSwitching } from "./repoReuse";

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

describe("isContextSwitching", () => {
  it("is false while no repo is displayed yet, regardless of context", () => {
    expect(isContextSwitching(false, "/a", null)).toBe(false);
    expect(isContextSwitching(false, "/a", "/b")).toBe(false);
  });

  it("is false once the displayed repo matches the active context", () => {
    expect(isContextSwitching(true, "/proj", "/proj")).toBe(false);
  });

  it("is true the instant the context path changes, before any refetch", () => {
    // This is the exact race: a repo from /a is still displayed (hasRepo),
    // the user has already navigated to /b, and no request has resolved yet.
    expect(isContextSwitching(true, "/b", "/a")).toBe(true);
  });

  it("is true for a nested path that may resolve to a different repo", () => {
    expect(isContextSwitching(true, "/proj/wt", "/proj")).toBe(true);
  });
});
