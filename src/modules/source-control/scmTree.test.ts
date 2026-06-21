import { describe, expect, it } from "vitest";
import type { SourceControlEntry } from "./useSourceControlPanel";
import {
  buildScmTree,
  flattenScmTree,
  type ScmDirNode,
  type ScmTreeNode,
} from "./scmTree";

function entry(path: string, mode: "+" | "-" = "-"): SourceControlEntry {
  return {
    key: `${mode}:${path}`,
    path,
    mode,
    indexStatus: " ",
    worktreeStatus: "M",
    statusLabel: "Modified",
    statusCode: "M",
    originalPath: null,
    untracked: false,
  };
}

const isDir = (n: ScmTreeNode): n is ScmDirNode => n.type === "dir";

describe("buildScmTree", () => {
  it("compacts a single-child directory chain into one node", () => {
    const tree = buildScmTree([entry("src/modules/foo/a.ts")]);
    expect(tree).toHaveLength(1);
    const dir = tree[0];
    expect(isDir(dir) && dir.name).toBe("src/modules/foo");
    expect(isDir(dir) && dir.fullPath).toBe("src/modules/foo");
    expect(isDir(dir) && dir.children).toHaveLength(1);
    expect(isDir(dir) && dir.children[0].type).toBe("file");
  });

  it("stops compacting at a branch", () => {
    const tree = buildScmTree([entry("src/a/x.ts"), entry("src/b/y.ts")]);
    expect(tree).toHaveLength(1);
    const src = tree[0] as ScmDirNode;
    expect(src.name).toBe("src");
    expect(src.children.map((c) => (c as ScmDirNode).name)).toEqual(["a", "b"]);
  });

  it("does not compact a directory that also contains a file", () => {
    const tree = buildScmTree([entry("src/a.ts"), entry("src/sub/b.ts")]);
    expect(tree).toHaveLength(1);
    const src = tree[0] as ScmDirNode;
    expect(src.name).toBe("src");
    // directories before files: "sub" dir first, then "a.ts" file
    expect(src.children[0].type).toBe("dir");
    expect((src.children[0] as ScmDirNode).name).toBe("sub");
    expect(src.children[1].type).toBe("file");
  });

  it("places repository-root files directly under the root", () => {
    const tree = buildScmTree([entry("README.md")]);
    expect(tree).toHaveLength(1);
    expect(tree[0].type).toBe("file");
  });

  it("yields two independent leaves for a file staged and unstaged", () => {
    const tree = buildScmTree([entry("a.ts", "+"), entry("a.ts", "-")]);
    const files = tree.filter((n) => n.type === "file");
    expect(files).toHaveLength(2);
    const keys = files.map((f) => (f.type === "file" ? f.entry.key : ""));
    expect(new Set(keys)).toEqual(new Set(["+:a.ts", "-:a.ts"]));
  });

  it("orders directories before files, case-insensitive", () => {
    const tree = buildScmTree([
      entry("Zoo/x.ts"),
      entry("apple.ts"),
      entry("Banana.ts"),
      entry("alpha/y.ts"),
    ]);
    const names = tree.map((n) =>
      n.type === "dir" ? n.name : (n.entry.path),
    );
    expect(names).toEqual(["alpha", "Zoo", "apple.ts", "Banana.ts"]);
  });

  it("counts descendant files", () => {
    const tree = buildScmTree([entry("src/a/x.ts"), entry("src/a/y.ts")]);
    expect((tree[0] as ScmDirNode).fileCount).toBe(2);
  });
});

describe("flattenScmTree", () => {
  it("emits rows with depth and honors the collapsed set", () => {
    const tree = buildScmTree([entry("src/a/x.ts"), entry("src/a/y.ts")]);
    const open = flattenScmTree(tree, new Set());
    expect(open.map((r) => `${r.type}:${r.depth}`)).toEqual([
      "dir:0",
      "file:1",
      "file:1",
    ]);

    const collapsed = flattenScmTree(tree, new Set(["src/a"]));
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].type).toBe("dir");
  });
});
