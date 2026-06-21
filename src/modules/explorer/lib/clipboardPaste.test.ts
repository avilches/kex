import { describe, expect, it } from "vitest";
import { planPaste, resolveDestDir } from "@/modules/explorer/lib/clipboardPaste";

describe("resolveDestDir", () => {
  it("returns the path itself when the target is a dir", () => {
    expect(resolveDestDir("/a/b", true)).toBe("/a/b");
  });
  it("returns the parent dir when the target is a file", () => {
    expect(resolveDestDir("/a/b/file.txt", false)).toBe("/a/b");
  });
});

describe("planPaste copy", () => {
  it("keeps the original name when there is no collision", () => {
    expect(
      planPaste({ path: "/a/x.txt", kind: "file", mode: "copy" }, "/b", []),
    ).toEqual({ action: "copy", name: "x.txt" });
  });
  it("suffixes ' copy' on collision in the destination", () => {
    expect(
      planPaste({ path: "/a/x.txt", kind: "file", mode: "copy" }, "/b", ["x.txt"]),
    ).toEqual({ action: "copy", name: "x copy.txt" });
  });
  it("blocks pasting a folder into itself", () => {
    expect(
      planPaste({ path: "/a/src", kind: "dir", mode: "copy" }, "/a/src", []),
    ).toEqual({ action: "error", reason: "self-nest" });
  });
  it("blocks pasting a folder into its own descendant", () => {
    expect(
      planPaste({ path: "/a/src", kind: "dir", mode: "copy" }, "/a/src/sub", []),
    ).toEqual({ action: "error", reason: "self-nest" });
  });
});

describe("planPaste cut", () => {
  it("moves keeping the name when there is no collision", () => {
    expect(
      planPaste({ path: "/a/x.txt", kind: "file", mode: "cut" }, "/b", []),
    ).toEqual({ action: "move", name: "x.txt" });
  });
  it("is a no-op when moving into the same folder", () => {
    expect(
      planPaste({ path: "/a/x.txt", kind: "file", mode: "cut" }, "/a", []),
    ).toEqual({ action: "noop" });
  });
  it("errors on collision instead of auto-renaming a move", () => {
    expect(
      planPaste({ path: "/a/x.txt", kind: "file", mode: "cut" }, "/b", ["x.txt"]),
    ).toEqual({ action: "error", reason: "exists" });
  });
  it("blocks moving a folder into its own descendant", () => {
    expect(
      planPaste({ path: "/a/src", kind: "dir", mode: "cut" }, "/a/src/sub", []),
    ).toEqual({ action: "error", reason: "self-nest" });
  });
});
