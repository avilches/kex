import { describe, expect, it } from "vitest";
import { foldersToReload } from "./invalidate";

const ROOT = "/vault";

describe("foldersToReload", () => {
  it("invalidates the containing folder and its parent", () => {
    const loaded = ["", "docs", "docs/pending"];
    expect(foldersToReload(ROOT, "/vault/docs/pending/BUG-99.md", loaded)).toEqual([
      "docs/pending",
      "docs",
    ]);
  });

  it("invalidates only the root for a path directly in the root", () => {
    expect(foldersToReload(ROOT, "/vault/README.md", ["", "docs"])).toEqual([""]);
  });

  it("skips folders that are not loaded", () => {
    expect(foldersToReload(ROOT, "/vault/docs/pending/BUG-99.md", ["docs"])).toEqual(["docs"]);
    expect(foldersToReload(ROOT, "/vault/other/x.md", ["", "docs"])).toEqual([""]);
  });

  it("invalidates a loaded folder that is itself the changed path", () => {
    const loaded = ["", "docs", "docs/pending"];
    expect(foldersToReload(ROOT, "/vault/docs/pending", loaded)).toEqual([
      "docs/pending",
      "docs",
      "",
    ]);
  });

  it("ignores a path outside the vault", () => {
    expect(foldersToReload(ROOT, "/elsewhere/x.md", ["", "docs"])).toEqual([]);
    expect(foldersToReload(ROOT, "/vault-other/x.md", ["", "docs"])).toEqual([]);
  });

  it("accepts backslash separators and a trailing slash on the root", () => {
    expect(foldersToReload("/vault/", "\\vault\\docs\\a.md", ["docs"])).toEqual(["docs"]);
  });

  it("never repeats a folder", () => {
    expect(foldersToReload(ROOT, "/vault/docs", ["", "docs"])).toEqual(["docs", ""]);
  });

  it("stops at the grandparent, three levels down", () => {
    const loaded = ["", "docs", "docs/pending", "docs/pending/sub"];
    expect(foldersToReload(ROOT, "/vault/docs/pending/sub/x.md", loaded)).toEqual([
      "docs/pending/sub",
      "docs/pending",
    ]);
  });

  it("invalidates three levels when the changed path is a loaded folder", () => {
    const loaded = ["", "docs", "docs/pending", "docs/pending/sub"];
    expect(foldersToReload(ROOT, "/vault/docs/pending/sub", loaded)).toEqual([
      "docs/pending/sub",
      "docs/pending",
      "docs",
    ]);
  });
});
