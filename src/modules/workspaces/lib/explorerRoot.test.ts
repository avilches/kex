import { describe, expect, it } from "vitest";
import {
  ancestorsToExpand,
  commonAncestor,
  isFilesystemRoot,
  isUnder,
  parentRoot,
  resolveExplorerRoot,
  resolveFocusTarget,
} from "./explorerRoot";

describe("resolveExplorerRoot", () => {
  const base = {
    terminalCwd: "/proj/sub",
    gitRoot: "/proj",
    pinnedRoot: "/pinned",
    fsRoot: null as string | null,
    home: "/home/u",
  };

  it("terminal mode follows the terminal cwd", () => {
    expect(resolveExplorerRoot({ ...base, mode: "terminal" })).toBe("/proj/sub");
  });

  it("terminal mode falls back to home when no cwd", () => {
    expect(
      resolveExplorerRoot({ ...base, mode: "terminal", terminalCwd: null }),
    ).toBe("/home/u");
  });

  it("git mode uses the known git root", () => {
    expect(resolveExplorerRoot({ ...base, mode: "git" })).toBe("/proj");
  });

  it("git mode falls back to terminal cwd when no git root", () => {
    expect(resolveExplorerRoot({ ...base, mode: "git", gitRoot: null })).toBe(
      "/proj/sub",
    );
  });

  it("git mode falls back to home when no git root and no cwd", () => {
    expect(
      resolveExplorerRoot({
        ...base,
        mode: "git",
        gitRoot: null,
        terminalCwd: null,
      }),
    ).toBe("/home/u");
  });

  it("filesystem mode returns fsRoot when set", () => {
    expect(
      resolveExplorerRoot({ ...base, mode: "filesystem", fsRoot: "/proj/sub" }),
    ).toBe("/proj/sub");
  });

  it("filesystem mode falls back to home when fsRoot is null", () => {
    expect(resolveExplorerRoot({ ...base, mode: "filesystem" })).toBe(
      "/home/u",
    );
  });

  it("pinned mode returns the pinned path", () => {
    expect(resolveExplorerRoot({ ...base, mode: "pinned" })).toBe("/pinned");
  });

  it("pinned mode returns null when nothing is pinned", () => {
    expect(
      resolveExplorerRoot({ ...base, mode: "pinned", pinnedRoot: null }),
    ).toBeNull();
  });
});

describe("isFilesystemRoot", () => {
  it("treats unix root as top", () => {
    expect(isFilesystemRoot("/")).toBe(true);
  });
  it("treats a windows drive root as top", () => {
    expect(isFilesystemRoot("C:/")).toBe(true);
    expect(isFilesystemRoot("C:")).toBe(true);
  });
  it("a normal path is not a root", () => {
    expect(isFilesystemRoot("/home/u")).toBe(false);
    expect(isFilesystemRoot("C:/Users")).toBe(false);
  });
});

describe("parentRoot", () => {
  it("climbs a unix path", () => {
    expect(parentRoot("/home/u")).toBe("/home");
    expect(parentRoot("/home")).toBe("/");
  });
  it("normalizes a windows drive parent back to drive root", () => {
    expect(parentRoot("C:/Users")).toBe("C:/");
  });
});

describe("isUnder", () => {
  it("treats equal paths as under", () => {
    expect(isUnder("/a/b", "/a/b")).toBe(true);
  });
  it("detects a descendant", () => {
    expect(isUnder("/a/b/c", "/a/b")).toBe(true);
  });
  it("rejects a sibling prefix", () => {
    expect(isUnder("/a/bc", "/a/b")).toBe(false);
  });
  it("rejects an unrelated path", () => {
    expect(isUnder("/x/y", "/a/b")).toBe(false);
  });
});

describe("commonAncestor", () => {
  it("returns the deepest shared directory", () => {
    expect(commonAncestor("/a/b/c", "/a/b/d/e")).toBe("/a/b");
  });
  it("returns the shallower path when one contains the other", () => {
    expect(commonAncestor("/a", "/a/b/c")).toBe("/a");
  });
  it("falls back to unix root when only root is shared", () => {
    expect(commonAncestor("/x/y", "/a/b")).toBe("/");
  });
  it("returns the drive root when only the drive is shared", () => {
    expect(commonAncestor("C:/a/b", "C:/c")).toBe("C:/");
  });
  it("returns null across different drives", () => {
    expect(commonAncestor("C:/a", "D:/b")).toBeNull();
  });
  it("normalizes backslashes", () => {
    expect(commonAncestor("C:\\a\\b", "C:\\a\\c")).toBe("C:/a");
  });
});

describe("ancestorsToExpand", () => {
  it("lists dirs from the child of root down to the file's parent", () => {
    expect(ancestorsToExpand("/a", "/a/b/c/file.ts")).toEqual([
      "/a/b",
      "/a/b/c",
    ]);
  });
  it("returns empty when the file sits directly under root", () => {
    expect(ancestorsToExpand("/a/b", "/a/b/file.ts")).toEqual([]);
  });
  it("returns empty when the file is not under root", () => {
    expect(ancestorsToExpand("/a/b", "/x/y/file.ts")).toEqual([]);
  });
});

describe("resolveFocusTarget", () => {
  const file = "/home/u/proj/src/deep/file.ts";

  it("returns null when the current view already contains the file", () => {
    expect(
      resolveFocusTarget({
        file,
        mode: "git",
        currentRoot: "/home/u/proj",
        fsRoot: null,
        home: "/home/u",
      }),
    ).toBeNull();
  });

  it("switches to filesystem using the common ancestor when the view does not contain the file", () => {
    expect(
      resolveFocusTarget({
        file,
        mode: "git",
        currentRoot: "/other/repo",
        fsRoot: "/home/u/notes",
        home: "/home/u",
      }),
    ).toEqual({ nextMode: "filesystem", nextFsRoot: "/home/u" });
  });

  it("keeps the fsRoot when it already contains the file", () => {
    expect(
      resolveFocusTarget({
        file,
        mode: "terminal",
        currentRoot: "/tmp",
        fsRoot: "/home/u/proj",
        home: "/home/u",
      }),
    ).toEqual({ nextMode: "filesystem", nextFsRoot: "/home/u/proj" });
  });

  it("uses home as the reference when fsRoot is null", () => {
    expect(
      resolveFocusTarget({
        file,
        mode: "pinned",
        currentRoot: null,
        fsRoot: null,
        home: "/home/u",
      }),
    ).toEqual({ nextMode: "filesystem", nextFsRoot: "/home/u" });
  });

  it("falls back to the file's parent dir when there is no common ancestor", () => {
    expect(
      resolveFocusTarget({
        file: "C:/work/a/file.ts",
        mode: "terminal",
        currentRoot: "D:/x",
        fsRoot: "D:/x",
        home: "D:/x",
      }),
    ).toEqual({ nextMode: "filesystem", nextFsRoot: "C:/work/a" });
  });
});
