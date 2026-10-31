import { describe, expect, it } from "vitest";
import {
  completeSegment,
  planTreeMove,
  sameFolder,
  splitTypedPath,
} from "./rootPathEdit";

describe("splitTypedPath", () => {
  it("splits at the last slash", () => {
    expect(splitTypedPath("/Users/avi")).toEqual({
      folder: "/Users",
      partial: "avi",
    });
    expect(splitTypedPath("/Users/")).toEqual({ folder: "/Users", partial: "" });
    expect(splitTypedPath("/us")).toEqual({ folder: "/", partial: "us" });
  });

  it("has no folder without a slash", () => {
    expect(splitTypedPath("abc")).toEqual({ folder: null, partial: "abc" });
  });

  it("keeps the slash of a drive root", () => {
    expect(splitTypedPath("C:\\Us")).toEqual({ folder: "C:/", partial: "Us" });
  });
});

describe("completeSegment", () => {
  const names = ["src", "Source", "docs", "node_modules"];

  it("completes with the first match ignoring case", () => {
    expect(completeSegment("so", names)).toBe("Source");
    expect(completeSegment("s", names)).toBe("Source");
  });

  it("does not complete empty or exact or unknown input", () => {
    expect(completeSegment("", names)).toBeNull();
    expect(completeSegment("docs", names)).toBeNull();
    expect(completeSegment("zz", names)).toBeNull();
  });
});

describe("planTreeMove", () => {
  const dirs = ["avilches", "Shared"];

  it("stays while typing inside the shown folder", () => {
    expect(planTreeMove("/Users/avi", "/Users", dirs)).toEqual({ kind: "stay" });
    expect(planTreeMove("/Users/", "/Users", dirs)).toEqual({ kind: "stay" });
    expect(planTreeMove("abc", "/Users", dirs)).toEqual({ kind: "stay" });
  });

  it("enters a child folder when a slash closes its name", () => {
    expect(planTreeMove("/Users/avilches/", "/Users", dirs)).toEqual({
      kind: "go",
      path: "/Users/avilches",
    });
  });

  it("matches the child ignoring case and returns the real name", () => {
    expect(planTreeMove("/Users/shared/", "/Users", dirs)).toEqual({
      kind: "go",
      path: "/Users/Shared",
    });
  });

  it("is invalid when the closed name is not a folder of the tree", () => {
    expect(planTreeMove("/Users/nope/", "/Users", dirs)).toEqual({
      kind: "invalid",
    });
  });

  it("stays when only the trailing slash of the current folder is removed", () => {
    expect(planTreeMove("/Users/avilches", "/Users/avilches", dirs)).toEqual({
      kind: "stay",
    });
    expect(planTreeMove("/Users/avilches/", "/Users/avilches", dirs)).toEqual({
      kind: "stay",
    });
  });

  it("goes up once the name of the current folder is cut or changed", () => {
    expect(planTreeMove("/Users/avilche", "/Users/avilches", dirs)).toEqual({
      kind: "go",
      path: "/Users",
    });
    expect(planTreeMove("/Users/", "/Users/avilches", dirs)).toEqual({
      kind: "go",
      path: "/Users",
    });
    expect(planTreeMove("/Users", "/Users/avilches", dirs)).toEqual({
      kind: "go",
      path: "/",
    });
    expect(planTreeMove("/", "/Users/avilches", dirs)).toEqual({
      kind: "go",
      path: "/",
    });
  });

  it("asks to verify jumps that the tree cannot explain", () => {
    expect(planTreeMove("/opt/x/", "/Users", dirs)).toEqual({
      kind: "verify",
      path: "/opt/x",
    });
    expect(planTreeMove("/Users/a/b/", "/Users", dirs)).toEqual({
      kind: "verify",
      path: "/Users/a/b",
    });
  });

  it("enters a child of the filesystem root", () => {
    expect(planTreeMove("/Users/", "/", ["Users"])).toEqual({
      kind: "go",
      path: "/Users",
    });
  });
});

describe("sameFolder", () => {
  it("ignores trailing slashes", () => {
    expect(sameFolder("/a/b/", "/a/b")).toBe(true);
    expect(sameFolder("/a", "/b")).toBe(false);
  });
});
