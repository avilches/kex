import { describe, expect, it } from "vitest";
import { pathBasename, pathDirname, segmentsFromCwd } from "./pathUtils";

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

describe("segmentsFromCwd", () => {
  it("returns home segment when cwd equals home", () => {
    const segments = segmentsFromCwd("/Users/foo", "/Users/foo");
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      label: "~",
      fullPath: "/Users/foo",
      isHome: true,
    });
  });

  it("returns home segment with nested path", () => {
    const segments = segmentsFromCwd("/Users/foo/projects/myapp", "/Users/foo");
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({
      label: "~",
      fullPath: "/Users/foo",
      isHome: true,
    });
    expect(segments[1]).toEqual({
      label: "projects",
      fullPath: "/Users/foo/projects",
      isHome: false,
    });
    expect(segments[2]).toEqual({
      label: "myapp",
      fullPath: "/Users/foo/projects/myapp",
      isHome: false,
    });
  });

  it("returns drive segment for Windows drive root", () => {
    const segments = segmentsFromCwd("C:/", null);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      label: "C:",
      fullPath: "C:/",
      isHome: false,
    });
  });

  it("returns drive segment with nested path", () => {
    const segments = segmentsFromCwd("C:/Users/foo/projects", null);
    expect(segments).toHaveLength(4);
    expect(segments[0]).toEqual({
      label: "C:",
      fullPath: "C:/",
      isHome: false,
    });
    expect(segments[1]).toEqual({
      label: "Users",
      fullPath: "C:/Users",
      isHome: false,
    });
    expect(segments[2]).toEqual({
      label: "foo",
      fullPath: "C:/Users/foo",
      isHome: false,
    });
    expect(segments[3]).toEqual({
      label: "projects",
      fullPath: "C:/Users/foo/projects",
      isHome: false,
    });
  });

  it("collapses to home when cwd drive differs in case from home drive on Windows", () => {
    const segments = segmentsFromCwd("c:/Users/foo/projects", "C:/Users/foo");
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({
      label: "~",
      fullPath: "C:/Users/foo",
      isHome: true,
    });
    expect(segments[1]).toEqual({
      label: "projects",
      fullPath: "C:/Users/foo/projects",
      isHome: false,
    });
  });

  it("returns root segment for Unix absolute path without home", () => {
    const segments = segmentsFromCwd("/etc/config", null);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({
      label: "/",
      fullPath: "/",
      isHome: false,
    });
  });

  it("handles backslash separators in Windows paths", () => {
    const segments = segmentsFromCwd("C:\\Users\\foo\\projects", "C:\\Users\\foo");
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({
      label: "~",
      fullPath: "C:/Users/foo",
      isHome: true,
    });
    expect(segments[1]).toEqual({
      label: "projects",
      fullPath: "C:/Users/foo/projects",
      isHome: false,
    });
  });

  it("preserves case of segments in output when home differs in drive case", () => {
    const segments = segmentsFromCwd("c:/Users/foo/MyProject", "C:/Users/foo");
    expect(segments).toHaveLength(2);
    expect(segments[0].label).toBe("~");
    expect(segments[1].label).toBe("MyProject");
  });
});
