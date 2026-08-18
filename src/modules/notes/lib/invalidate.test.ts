import { describe, expect, it } from "vitest";
import { foldersToReload, isSelfWrite } from "./invalidate";

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

describe("isSelfWrite", () => {
  it("treats the vault config file as our own write", () => {
    expect(isSelfWrite(ROOT, "/vault/kex.json")).toBe(true);
  });

  it("treats an atomic-write temporary as our own write", () => {
    expect(isSelfWrite(ROOT, "/vault/.tmpA1b2C3")).toBe(true);
  });

  it("leaves an ordinary note alone", () => {
    expect(isSelfWrite(ROOT, "/vault/docs/kex.md")).toBe(false);
  });

  it("only claims the vault's own config, not one in a subfolder", () => {
    expect(isSelfWrite(ROOT, "/vault/docs/kex.json")).toBe(false);
  });
});
