import { describe, expect, it } from "vitest";
import {
  type TextEntry,
  isTextEntry,
  parseMarkdown,
  removeEntry,
  renderMarkdown,
  upsertEntry,
} from "./entries";

const a: TextEntry = { section: "general", kind: "text", original: "Foo", edited: "Bar" };
const b: TextEntry = { section: "terminal", kind: "title", original: "Baz", edited: "Qux" };

describe("entries", () => {
  it("upsert replaces the entry with the same kind and original", () => {
    const next = upsertEntry([a, b], { ...a, edited: "Other" });
    expect(next).toEqual([{ ...a, edited: "Other" }, b]);
  });

  it("upsert keeps the same original apart per kind", () => {
    const next = upsertEntry([a], { ...a, kind: "title" });
    expect(next).toHaveLength(2);
  });

  it("remove drops only the matching entry", () => {
    expect(removeEntry([a, b], "text", "Foo")).toEqual([b]);
    expect(removeEntry([a, b], "title", "Foo")).toEqual([a, b]);
  });

  it("round-trips through markdown, including quotes, newlines and unicode", () => {
    const tricky: TextEntry = {
      section: "actions",
      kind: "placeholder",
      original: 'Say "hi"\nthen go: ñ ### x',
      edited: "- Original: fake",
    };
    expect(parseMarkdown(renderMarkdown([a, b, tricky]))).toEqual([a, b, tricky]);
  });

  it("an empty list renders no entries", () => {
    const md = renderMarkdown([]);
    expect(md).toContain("No pending edits.");
    expect(parseMarkdown(md)).toEqual([]);
  });

  it("parse skips a hand-damaged entry and keeps the rest", () => {
    const md = renderMarkdown([a, b]).replace('- New: "Bar"', "- New: not json");
    expect(parseMarkdown(md)).toEqual([b]);
  });

  it("validates the shape of an entry", () => {
    expect(isTextEntry(a)).toBe(true);
    expect(isTextEntry({ ...a, kind: "other" })).toBe(false);
    expect(isTextEntry({ ...a, edited: "" })).toBe(false);
    expect(isTextEntry({ ...a, section: "../x" })).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});
