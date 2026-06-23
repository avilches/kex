import { describe, expect, it } from "vitest";
import {
  defaultsForExt,
  extOf,
  resolveEditorView,
  type EditorViewMap,
} from "./editorViewSettings";

describe("extOf", () => {
  it("lowercases the extension and drops the dot", () => {
    expect(extOf("/a/B/File.TS")).toBe("ts");
    expect(extOf("README.md")).toBe("md");
  });
  it("returns empty string when there is no extension", () => {
    expect(extOf("/a/Makefile")).toBe("");
    expect(extOf("/a/.gitignore")).toBe("gitignore");
  });
});

describe("defaultsForExt", () => {
  it("uses the prose profile for md/markdown/mdx/txt/text", () => {
    for (const e of ["md", "markdown", "mdx", "txt", "text"]) {
      expect(defaultsForExt(e)).toEqual({
        wrap: true,
        lineNumbers: false,
        whitespace: false,
        foldGutter: false,
      });
    }
  });
  it("uses the code profile for everything else incl. no-extension", () => {
    for (const e of ["ts", "rs", "py", ""]) {
      expect(defaultsForExt(e)).toEqual({
        wrap: false,
        lineNumbers: true,
        whitespace: false,
        foldGutter: true,
      });
    }
  });
});

describe("resolveEditorView", () => {
  it("returns the profile defaults when the extension has no entry", () => {
    expect(resolveEditorView("a.ts", {})).toEqual(defaultsForExt("ts"));
  });
  it("merges a partial stored entry over the defaults", () => {
    const map: EditorViewMap = { ts: { lineNumbers: false } };
    expect(resolveEditorView("a.ts", map)).toEqual({
      wrap: false,
      lineNumbers: false,
      whitespace: false,
      foldGutter: true,
    });
  });
  it("isolates extensions from each other", () => {
    const map: EditorViewMap = { ts: { wrap: true } };
    expect(resolveEditorView("a.py", map)).toEqual(defaultsForExt("py"));
  });
});
