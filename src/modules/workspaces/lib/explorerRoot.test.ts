import { describe, expect, it } from "vitest";
import {
  ancestorsToExpand,
  commonAncestor,
  isFilesystemRoot,
  isUnder,
  parentRoot,
  resolveExplorerRoot,
  resolveFocusTarget,
  resolveSidebarTarget,
  migrateExplorerRootMode,
} from "./explorerRoot";

describe("resolveExplorerRoot", () => {
  const base = {
    pinnedRoot: "/pinned",
    fsRoot: null as string | null,
    home: "/home/u",
  };

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
        mode: "filesystem",
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
        mode: "filesystem",
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
        mode: "filesystem",
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
        mode: "filesystem",
        currentRoot: "D:/x",
        fsRoot: "D:/x",
        home: "D:/x",
      }),
    ).toEqual({ nextMode: "filesystem", nextFsRoot: "C:/work/a" });
  });
});

describe("resolveSidebarTarget", () => {
  const home = "/Users/me";

  it("uses pinned mode when the folder is under the workspace root", () => {
    const t = resolveSidebarTarget({
      folder: "/a/b/c/d",
      workspaceRoot: "/a/b",
      gitRoot: "/a/b",
      currentFsRoot: null,
      home,
    });
    expect(t).toEqual({ mode: "pinned", fsRoot: null });
  });

  it("treats the workspace root folder itself as under it", () => {
    const t = resolveSidebarTarget({
      folder: "/a/b",
      workspaceRoot: "/a/b",
      gitRoot: null,
      currentFsRoot: null,
      home,
    });
    expect(t.mode).toBe("pinned");
  });

  it("uses the git root as filesystem root when outside the workspace root", () => {
    const t = resolveSidebarTarget({
      folder: "/x/repo/src/inner",
      workspaceRoot: "/a/b",
      gitRoot: "/x/repo",
      currentFsRoot: null,
      home,
    });
    expect(t).toEqual({ mode: "filesystem", fsRoot: "/x/repo" });
  });

  it("falls back to the common ancestor with the current fs root", () => {
    const t = resolveSidebarTarget({
      folder: "/x/y/z",
      workspaceRoot: null,
      gitRoot: null,
      currentFsRoot: "/x/other",
      home,
    });
    expect(t).toEqual({ mode: "filesystem", fsRoot: "/x" });
  });

  it("falls back to the folder dirname when there is no common ancestor", () => {
    const t = resolveSidebarTarget({
      folder: "/x/y/z",
      workspaceRoot: null,
      gitRoot: null,
      currentFsRoot: null,
      home: null,
    });
    expect(t).toEqual({ mode: "filesystem", fsRoot: "/x/y" });
  });
});

describe("migrateExplorerRootMode", () => {
  it("maps removed modes to filesystem", () => {
    expect(migrateExplorerRootMode("terminal")).toBe("filesystem");
    expect(migrateExplorerRootMode("git")).toBe("filesystem");
  });
  it("keeps valid modes", () => {
    expect(migrateExplorerRootMode("filesystem")).toBe("filesystem");
    expect(migrateExplorerRootMode("pinned")).toBe("pinned");
  });
  it("returns undefined for missing/unknown", () => {
    expect(migrateExplorerRootMode(undefined)).toBeUndefined();
    expect(migrateExplorerRootMode("bogus")).toBeUndefined();
  });
});
