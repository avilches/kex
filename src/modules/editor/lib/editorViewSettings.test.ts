import { describe, expect, it } from "vitest";
import {
  CODE_DEFAULTS,
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

describe("resolveEditorView", () => {
  it("returns CODE_DEFAULTS when the map is empty", () => {
    expect(resolveEditorView("a.ts", {})).toEqual(CODE_DEFAULTS);
    expect(resolveEditorView("a.md", {})).toEqual(CODE_DEFAULTS);
  });
  it("merges a partial single-ext entry over CODE_DEFAULTS", () => {
    const map: EditorViewMap = { ts: { lineNumbers: false } };
    expect(resolveEditorView("a.ts", map)).toEqual({
      ...CODE_DEFAULTS,
      lineNumbers: false,
    });
  });
  it("isolates extensions from each other", () => {
    const map: EditorViewMap = { ts: { wrap: true } };
    expect(resolveEditorView("a.py", map)).toEqual(CODE_DEFAULTS);
  });
  it("falls back to * when no specific match", () => {
    const map: EditorViewMap = { "*": { indentSize: 2 } };
    expect(resolveEditorView("a.go", map).indentSize).toBe(2);
  });
  it("* does not apply when a specific key matches", () => {
    const map: EditorViewMap = {
      ts: { indentSize: 2 },
      "*": { indentSize: 8 },
    };
    expect(resolveEditorView("a.ts", map).indentSize).toBe(2);
  });
  it("merges * base with specific entry, entry wins conflicts", () => {
    const map: EditorViewMap = {
      ts: { lineNumbers: false },
      "*": { indentSize: 2 },
    };
    const resolved = resolveEditorView("a.ts", map);
    expect(resolved.indentSize).toBe(2);
    expect(resolved.lineNumbers).toBe(false);
  });
  it("base defaults are still applied for fields not in the overlay", () => {
    const map: EditorViewMap = { "*": { indentSize: 2 } };
    const resolved = resolveEditorView("a.ts", map);
    expect(resolved.lineNumbers).toBe(CODE_DEFAULTS.lineNumbers);
    expect(resolved.indentSize).toBe(2);
  });
});
