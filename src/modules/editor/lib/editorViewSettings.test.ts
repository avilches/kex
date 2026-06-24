import { describe, expect, it } from "vitest";
import {
  CODE_DEFAULTS,
  defaultsForExt,
  extOf,
  findKeyForExt,
  normalizeExtKey,
  PROSE_DEFAULTS,
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
        indentSize: 4,
        indentWithTabs: false,
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
        indentSize: 4,
        indentWithTabs: false,
      });
    }
  });
});

describe("normalizeExtKey", () => {
  it("sorts alphabetically and joins with commas", () => {
    expect(normalizeExtKey(["ts", "tsx", "js"])).toBe("js,ts,tsx");
  });
  it("lowercases inputs", () => {
    expect(normalizeExtKey(["MD", "Txt"])).toBe("md,txt");
  });
  it("trims whitespace from each ext", () => {
    expect(normalizeExtKey([" ts ", "tsx"])).toBe("ts,tsx");
  });
  it("handles single extension", () => {
    expect(normalizeExtKey(["py"])).toBe("py");
  });
  it("filters empty strings", () => {
    expect(normalizeExtKey(["ts", "", "tsx"])).toBe("ts,tsx");
  });
});

describe("findKeyForExt", () => {
  it("finds a single-ext key", () => {
    const map: EditorViewMap = { ts: { wrap: true } };
    expect(findKeyForExt("ts", map)).toBe("ts");
  });
  it("finds ext within a multi-ext key", () => {
    const map: EditorViewMap = { "md,markdown,txt": { wrap: true } };
    expect(findKeyForExt("md", map)).toBe("md,markdown,txt");
    expect(findKeyForExt("txt", map)).toBe("md,markdown,txt");
  });
  it("returns null when ext is absent", () => {
    const map: EditorViewMap = { ts: { wrap: true } };
    expect(findKeyForExt("py", map)).toBeNull();
  });
  it("ignores the * key", () => {
    const map: EditorViewMap = { "*": { wrap: true } };
    expect(findKeyForExt("ts", map)).toBeNull();
  });
  it("prefers the key with fewer extensions (most specific)", () => {
    const map: EditorViewMap = {
      "md,markdown,txt": { wrap: true },
      md: { wrap: false },
    };
    expect(findKeyForExt("md", map)).toBe("md");
  });
});

describe("resolveEditorView", () => {
  it("returns the profile defaults when the map is empty", () => {
    expect(resolveEditorView("a.ts", {})).toEqual(defaultsForExt("ts"));
    expect(resolveEditorView("a.md", {})).toEqual(defaultsForExt("md"));
  });
  it("merges a partial single-ext entry over the defaults", () => {
    const map: EditorViewMap = { ts: { lineNumbers: false } };
    expect(resolveEditorView("a.ts", map)).toEqual({
      ...CODE_DEFAULTS,
      lineNumbers: false,
    });
  });
  it("isolates extensions from each other", () => {
    const map: EditorViewMap = { ts: { wrap: true } };
    expect(resolveEditorView("a.py", map)).toEqual(defaultsForExt("py"));
  });
  it("resolves via a multi-ext group key", () => {
    const map: EditorViewMap = { "md,markdown,txt": { indentSize: 2 } };
    expect(resolveEditorView("a.md", map)).toEqual({
      ...PROSE_DEFAULTS,
      indentSize: 2,
    });
    expect(resolveEditorView("a.txt", map)).toEqual({
      ...PROSE_DEFAULTS,
      indentSize: 2,
    });
  });
  it("single-ext key beats multi-ext key", () => {
    const map: EditorViewMap = {
      "md,txt": { indentSize: 2 },
      md: { indentSize: 6 },
    };
    expect(resolveEditorView("a.md", map).indentSize).toBe(6);
    expect(resolveEditorView("a.txt", map).indentSize).toBe(2);
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
  it("base defaults are still applied for fields not in the overlay", () => {
    const map: EditorViewMap = { "*": { indentSize: 2 } };
    const resolved = resolveEditorView("a.ts", map);
    expect(resolved.lineNumbers).toBe(CODE_DEFAULTS.lineNumbers);
    expect(resolved.indentSize).toBe(2);
  });
});
