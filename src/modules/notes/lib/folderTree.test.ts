import { describe, expect, it } from "vitest";
import { buildFolderTree, countDirectNotes, nextFolderName } from "./folderTree";

describe("buildFolderTree", () => {
  it("nests children under parents, sorted case-insensitively", () => {
    const tree = buildFolderTree(["docs/sub", "Zeta", "docs", "alpha"]);
    expect(tree.map((n) => n.name)).toEqual(["alpha", "docs", "Zeta"]);
    const docs = tree[1];
    expect(docs.relPath).toBe("docs");
    expect(docs.children).toHaveLength(1);
    expect(docs.children[0]).toMatchObject({ name: "sub", relPath: "docs/sub" });
  });

  it("handles empty input", () => {
    expect(buildFolderTree([])).toEqual([]);
  });
});

describe("nextFolderName", () => {
  it("starts at New Folder and increments, case-insensitive", () => {
    expect(nextFolderName([])).toBe("New Folder");
    expect(nextFolderName(["new folder"])).toBe("New Folder 2");
    expect(nextFolderName(["New Folder", "New Folder 2"])).toBe("New Folder 3");
  });
});

describe("countDirectNotes", () => {
  it("counts notes per exact folder, root included", () => {
    const counts = countDirectNotes([
      { folder: "" },
      { folder: "docs" },
      { folder: "docs/sub" },
      { folder: "docs/sub" },
    ]);
    expect(counts.get("")).toBe(1);
    expect(counts.get("docs")).toBe(1);
    expect(counts.get("docs/sub")).toBe(2);
  });

  it("has no entry for a folder that only holds subfolders", () => {
    const counts = countDirectNotes([{ folder: "archive/2024" }]);
    expect(counts.get("archive")).toBeUndefined();
  });
});
