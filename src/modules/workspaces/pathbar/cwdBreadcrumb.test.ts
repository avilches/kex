import { describe, expect, it } from "vitest";
import { buildCwdBreadcrumb } from "./cwdBreadcrumb";

describe("buildCwdBreadcrumb", () => {
  const home = "/Users/me";
  const root = "/Users/me/Work/terax";

  it("collapses home and marks the root segment", () => {
    const { segments } = buildCwdBreadcrumb("/Users/me/Work/terax/src", root, home);
    expect(segments.map((s) => s.label)).toEqual(["~", "Work", "terax", "src"]);
    expect(segments.find((s) => s.fullPath === root)?.relation).toBe("root");
    expect(segments[0].isHome).toBe(true);
  });

  it("the last segment is the cwd itself (a directory), not dropped", () => {
    const { segments } = buildCwdBreadcrumb(root, root, home);
    expect(segments[segments.length - 1]?.fullPath).toBe(root);
    expect(segments[segments.length - 1]?.relation).toBe("root");
  });

  it("paths above the root render as above-root", () => {
    const { segments } = buildCwdBreadcrumb("/Users/me/Work", root, home);
    expect(segments.every((s) => s.relation !== "inside-root")).toBe(true);
  });

  it("does not treat a sibling prefix as inside root", () => {
    const { segments } = buildCwdBreadcrumb("/Users/me/Work/teraxedge", root, home);
    expect(segments.some((s) => s.relation === "inside-root")).toBe(false);
  });

  it("no workspace root falls back to home-collapsed absolute segments", () => {
    const { segments } = buildCwdBreadcrumb("/Users/me/tmp", null, home);
    expect(segments.map((s) => s.label)).toEqual(["~", "tmp"]);
  });
});
