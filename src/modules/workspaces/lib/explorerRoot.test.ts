import { describe, expect, it } from "vitest";
import {
  ancestorsToExpand,
  commonAncestor,
  isFilesystemRoot,
  isUnder,
  parentRoot,
  resolveExplorerRoot,
  resolveSidebarTarget,
  migrateExplorerRootMode,
} from "./explorerRoot";

describe("resolveExplorerRoot", () => {
  const base = {
    workspaceRoot: "/pinned",
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

  it("workspace mode returns the pinned path", () => {
    expect(resolveExplorerRoot({ ...base, mode: "workspace" })).toBe("/pinned");
  });

  it("workspace mode returns null when nothing is pinned", () => {
    expect(
      resolveExplorerRoot({ ...base, mode: "workspace", workspaceRoot: null }),
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

describe("resolveSidebarTarget", () => {
  const home = "/Users/me";

  it("uses workspace mode when the folder is under the workspace root", () => {
    const t = resolveSidebarTarget({
      folder: "/a/b/c/d",
      workspaceRoot: "/a/b",
      workspaceGitRoot: "/a/b",
      gitRoot: "/a/b",
      currentFsRoot: null,
      home,
    });
    expect(t).toEqual({ mode: "workspace", fsRoot: null });
  });

  it("treats the workspace root folder itself as under it", () => {
    const t = resolveSidebarTarget({
      folder: "/a/b",
      workspaceRoot: "/a/b",
      workspaceGitRoot: null,
      gitRoot: null,
      currentFsRoot: null,
      home,
    });
    expect(t.mode).toBe("workspace");
  });

  it("re-roots to a git repo nested under a workspace root that is itself a repo", () => {
    const t = resolveSidebarTarget({
      folder: "/proj/wt/src/file.ts",
      workspaceRoot: "/proj",
      workspaceGitRoot: "/proj",
      gitRoot: "/proj/wt",
      currentFsRoot: null,
      home,
    });
    expect(t).toEqual({ mode: "filesystem", fsRoot: "/proj/wt" });
  });

  it("stays in workspace mode in a non-repo container workspace holding a nested repo", () => {
    const t = resolveSidebarTarget({
      folder: "/Work/terax-ai/src/App.tsx",
      workspaceRoot: "/Work",
      workspaceGitRoot: null,
      gitRoot: "/Work/terax-ai",
      currentFsRoot: null,
      home,
    });
    expect(t).toEqual({ mode: "workspace", fsRoot: null });
  });

  it("stays in workspace mode when the focused file shares the workspace root's own repo", () => {
    const t = resolveSidebarTarget({
      folder: "/repo/sub/x/file.ts",
      workspaceRoot: "/repo/sub",
      workspaceGitRoot: "/repo",
      gitRoot: "/repo",
      currentFsRoot: null,
      home,
    });
    expect(t).toEqual({ mode: "workspace", fsRoot: null });
  });

  it("stays in workspace mode when the nearest git root is the workspace root itself", () => {
    const t = resolveSidebarTarget({
      folder: "/proj/src/file.ts",
      workspaceRoot: "/proj",
      workspaceGitRoot: "/proj",
      gitRoot: "/proj",
      currentFsRoot: null,
      home,
    });
    expect(t).toEqual({ mode: "workspace", fsRoot: null });
  });

  it("normalizes backslashes comparing a nested git root with the workspace repo", () => {
    const t = resolveSidebarTarget({
      folder: "C:\\proj\\wt\\file.ts",
      workspaceRoot: "C:\\proj",
      workspaceGitRoot: "C:\\proj",
      gitRoot: "C:\\proj\\wt",
      currentFsRoot: null,
      home,
    });
    expect(t).toEqual({ mode: "filesystem", fsRoot: "C:/proj/wt" });
  });

  it("uses the git root as filesystem root when outside the workspace root", () => {
    const t = resolveSidebarTarget({
      folder: "/x/repo/src/inner",
      workspaceRoot: "/a/b",
      workspaceGitRoot: null,
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
      workspaceGitRoot: null,
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
      workspaceGitRoot: null,
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
    expect(migrateExplorerRootMode("workspace")).toBe("workspace");
  });

  it("returns undefined for missing/unknown", () => {
    expect(migrateExplorerRootMode(undefined)).toBeUndefined();
    expect(migrateExplorerRootMode("bogus")).toBeUndefined();
  });
});
