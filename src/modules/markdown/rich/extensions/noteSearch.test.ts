// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { findMatches } from "@/modules/markdown/rich/extensions/noteSearch";

function docFor(html: string) {
  const editor = new Editor({ extensions: [StarterKit], content: html });
  const doc = editor.state.doc;
  editor.destroy();
  return doc;
}

describe("findMatches", () => {
  it("finds case-insensitive matches with positions", () => {
    const doc = docFor("<p>Foo bar foo</p>");
    const matches = findMatches(doc, "foo");
    expect(matches).toHaveLength(2);
    expect(matches[0].to - matches[0].from).toBe(3);
  });
  it("returns empty for empty query", () => {
    expect(findMatches(docFor("<p>abc</p>"), "")).toEqual([]);
  });
});
