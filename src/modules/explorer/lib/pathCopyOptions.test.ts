import { describe, expect, it } from "vitest";
import { pathCopyOptions } from "./pathCopyOptions";

const texts = (o: ReturnType<typeof pathCopyOptions>) => o.map((x) => [x.kind, x.text]);

describe("pathCopyOptions", () => {
  it("always offers the absolute path first", () => {
    expect(texts(pathCopyOptions("/a/b", { workspaceRoot: null, repoRoot: null }))).toEqual([
      ["absolute", "/a/b"],
    ]);
  });

  it("offers workspace, repository and relative against their own roots, in a fixed order", () => {
    const o = pathCopyOptions("/w/app/src/a.ts", {
      workspaceRoot: "/w",
      repoRoot: "/w/app",
      relativeRoot: "/w/app/src",
    });
    expect(texts(o)).toEqual([
      ["absolute", "/w/app/src/a.ts"],
      ["workspace", "app/src/a.ts"],
      ["repository", "src/a.ts"],
      ["relative", "a.ts"],
    ]);
  });

  it("keeps equal texts: the entries do not hide each other", () => {
    const o = pathCopyOptions("/w/a.ts", { workspaceRoot: "/w", repoRoot: "/w", relativeRoot: "/w" });
    expect(o.map((x) => x.text)).toEqual(["/w/a.ts", "a.ts", "a.ts", "a.ts"]);
  });

  it("skips a base that is missing, does not contain the path, or is the path itself", () => {
    expect(
      texts(pathCopyOptions("/x/a", { workspaceRoot: "/w", repoRoot: "/x/a", relativeRoot: null })),
    ).toEqual([["absolute", "/x/a"]]);
  });

  it("labels each entry and its toast", () => {
    const o = pathCopyOptions("/w/a", { workspaceRoot: "/w", repoRoot: "/w", relativeRoot: "/w" });
    expect(o.map((x) => [x.label, x.toast])).toEqual([
      ["Absolute Path", "Copied absolute path"],
      ["Workspace Path", "Copied workspace path"],
      ["Repository Path", "Copied repository path"],
      ["Relative Path", "Copied relative path"],
    ]);
  });
});
