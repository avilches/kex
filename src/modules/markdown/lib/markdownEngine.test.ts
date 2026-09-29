import { describe, expect, it } from "vitest";
import {
  MARKDOWN_ENGINES,
  parseMarkdownEngine,
  resolveMarkdownEngine,
} from "@/modules/markdown/lib/markdownEngine";

describe("parseMarkdownEngine", () => {
  it("accepts the three engines", () => {
    expect(parseMarkdownEngine("tiptap")).toBe("tiptap");
    expect(parseMarkdownEngine("milkdown")).toBe("milkdown");
    expect(parseMarkdownEngine("codemirror")).toBe("codemirror");
  });

  it("falls back to tiptap for anything else", () => {
    expect(parseMarkdownEngine("rich")).toBe("tiptap");
    expect(parseMarkdownEngine(undefined)).toBe("tiptap");
    expect(parseMarkdownEngine(null)).toBe("tiptap");
    expect(parseMarkdownEngine(7)).toBe("tiptap");
    expect(parseMarkdownEngine("Milkdown")).toBe("tiptap");
    expect(parseMarkdownEngine("legacy")).toBe("tiptap");
  });

  it("lists every engine exactly once", () => {
    expect([...MARKDOWN_ENGINES]).toEqual(["tiptap", "milkdown", "codemirror"]);
  });
});

describe("resolveMarkdownEngine", () => {
  it("prefers the tab's own engine", () => {
    expect(resolveMarkdownEngine("milkdown", "tiptap")).toBe("milkdown");
    expect(resolveMarkdownEngine("codemirror", "milkdown")).toBe("codemirror");
  });

  it("falls back to the preference when the tab has none", () => {
    expect(resolveMarkdownEngine(undefined, "milkdown")).toBe("milkdown");
  });

  it("falls back to the preference when the tab value is not an engine", () => {
    expect(resolveMarkdownEngine("rich" as never, "codemirror")).toBe("codemirror");
    expect(resolveMarkdownEngine("legacy" as never, "milkdown")).toBe("milkdown");
  });
});
