import { describe, expect, it } from "vitest";
import { editorPathDisplay } from "./editorPathDisplay";

describe("editorPathDisplay", () => {
  it("returns path relative to the explorer root", () => {
    expect(
      editorPathDisplay("/Users/foo/proj/src/modules/a.ts", "/Users/foo/proj", "/Users/foo"),
    ).toEqual({ dirs: ["src", "modules"], name: "a.ts" });
  });

  it("returns just the filename when the file sits directly in the root", () => {
    expect(editorPathDisplay("/Users/foo/proj/a.ts", "/Users/foo/proj", "/Users/foo")).toEqual({
      dirs: [],
      name: "a.ts",
    });
  });

  it("tolerates a trailing slash on the root", () => {
    expect(editorPathDisplay("/Users/foo/proj/src/a.ts", "/Users/foo/proj/", "/Users/foo")).toEqual({
      dirs: ["src"],
      name: "a.ts",
    });
  });

  it("falls back to an absolute home breadcrumb when the file is outside the root", () => {
    expect(editorPathDisplay("/Users/foo/other/a.ts", "/Users/foo/proj", "/Users/foo")).toEqual({
      dirs: ["~", "other"],
      name: "a.ts",
    });
  });

  it("falls back to an absolute breadcrumb when there is no root", () => {
    expect(editorPathDisplay("/etc/hosts", null, "/Users/foo")).toEqual({
      dirs: ["/", "etc"],
      name: "hosts",
    });
  });

  it("does not treat a sibling prefix as inside the root", () => {
    expect(editorPathDisplay("/foo/barbaz/a.ts", "/foo/bar", "/home")).toEqual({
      dirs: ["/", "foo", "barbaz"],
      name: "a.ts",
    });
  });

  it("matches the root case-insensitively but preserves segment case", () => {
    expect(
      editorPathDisplay("/Users/Foo/Proj/Src/A.ts", "/users/foo/proj", "/Users/foo"),
    ).toEqual({ dirs: ["Src"], name: "A.ts" });
  });

  it("handles Windows drive letters in the relative case", () => {
    expect(
      editorPathDisplay("C:\\Users\\foo\\proj\\src\\a.ts", "C:/Users/foo/proj", null),
    ).toEqual({ dirs: ["src"], name: "a.ts" });
  });

  it("handles Windows drive letters in the fallback case", () => {
    expect(editorPathDisplay("C:/tmp/a.ts", null, null)).toEqual({
      dirs: ["C:", "tmp"],
      name: "a.ts",
    });
  });
});
