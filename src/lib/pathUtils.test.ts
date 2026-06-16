import { describe, expect, it } from "vitest";
import { pathBasename, pathDirname } from "./pathUtils";

describe("pathDirname", () => {
  it("returns parent for a forward-slash path", () => {
    expect(pathDirname("/Users/foo/bar")).toBe("/Users/foo");
  });

  it("returns parent for a backslash path", () => {
    expect(pathDirname("C:\\Users\\foo\\bar")).toBe("C:/Users/foo");
  });

  it("returns parent for a mixed-separator path", () => {
    expect(pathDirname("C:/Users\\foo/bar")).toBe("C:/Users/foo");
  });

  it("returns / for a single-segment path", () => {
    expect(pathDirname("/foo")).toBe("/");
  });

  it("returns / when there is no separator", () => {
    expect(pathDirname("foo")).toBe("/");
  });
});

describe("pathBasename", () => {
  it("returns the last segment for a forward-slash path", () => {
    expect(pathBasename("/Users/foo/bar.ts")).toBe("bar.ts");
  });

  it("returns the last segment for a backslash path", () => {
    expect(pathBasename("C:\\Users\\foo\\bar.ts")).toBe("bar.ts");
  });

  it("returns the last segment for a mixed-separator path", () => {
    expect(pathBasename("C:/Users\\foo/bar.ts")).toBe("bar.ts");
  });

  it("returns the name when there is no separator", () => {
    expect(pathBasename("bar.ts")).toBe("bar.ts");
  });

  it("returns empty string for trailing separator", () => {
    expect(pathBasename("/Users/foo/")).toBe("");
  });
});
