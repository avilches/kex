import { describe, expect, it } from "vitest";
import { parseCellInline } from "@/modules/markdown/codemirror/lib/tableCellInline";

const text = (value: string) => ({ type: "text", value });

describe("parseCellInline", () => {
  it("returns plain text as one node and nothing for an empty cell", () => {
    expect(parseCellInline("just text")).toEqual([text("just text")]);
    expect(parseCellInline("")).toEqual([]);
  });

  it("reads bold, italic, strikethrough and inline code", () => {
    expect(parseCellInline("a **b** c")).toEqual([text("a "), { type: "strong", children: [text("b")] }, text(" c")]);
    expect(parseCellInline("*i* _j_")).toEqual([
      { type: "em", children: [text("i")] },
      text(" "),
      { type: "em", children: [text("j")] },
    ]);
    expect(parseCellInline("~~gone~~")).toEqual([{ type: "del", children: [text("gone")] }]);
    expect(parseCellInline("run `ls -la` now")).toEqual([text("run "), { type: "code", value: "ls -la" }, text(" now")]);
  });

  it("nests formatting, and keeps the code's content literal", () => {
    expect(parseCellInline("**bold with `code` and *italic***")).toEqual([
      {
        type: "strong",
        children: [text("bold with "), { type: "code", value: "code" }, text(" and "), { type: "em", children: [text("italic")] }],
      },
    ]);
    expect(parseCellInline("`**not bold**`")).toEqual([{ type: "code", value: "**not bold**" }]);
  });

  it("reads subscript and superscript", () => {
    expect(parseCellInline("H~2~O X^2^")).toEqual([
      text("H"),
      { type: "sub", children: [text("2")] },
      text("O X"),
      { type: "sup", children: [text("2")] },
    ]);
  });

  it("reads inline links, with formatting inside the text, and drops the title and angle brackets", () => {
    expect(parseCellInline("see [the docs](https://example.com) now")).toEqual([
      text("see "),
      { type: "link", url: "https://example.com", children: [text("the docs")] },
      text(" now"),
    ]);
    expect(parseCellInline("[**a**](https://a.com)")).toEqual([
      { type: "link", url: "https://a.com", children: [{ type: "strong", children: [text("a")] }] },
    ]);
    expect(parseCellInline('[a](https://a.com "Title")')).toEqual([
      { type: "link", url: "https://a.com", children: [text("a")] },
    ]);
    expect(parseCellInline("[a](<https://a.com/x y>)")).toEqual([
      { type: "link", url: "https://a.com/x y", children: [text("a")] },
    ]);
  });

  it("reads autolinks and bare URLs as links to themselves", () => {
    expect(parseCellInline("<https://a.com>")).toEqual([
      { type: "link", url: "https://a.com", children: [text("https://a.com")] },
    ]);
    expect(parseCellInline("go https://a.com/x now")).toEqual([
      text("go "),
      { type: "link", url: "https://a.com/x", children: [text("https://a.com/x")] },
      text(" now"),
    ]);
    expect(parseCellInline("www.a.com")).toEqual([
      { type: "link", url: "https://www.a.com", children: [text("www.a.com")] },
    ]);
  });

  it("leaves bracketed text without a destination, and an unclosed marker, as plain text", () => {
    expect(parseCellInline("[TODO] item")).toEqual([text("[TODO] item")]);
    expect(parseCellInline("2 * 3 = 6")).toEqual([text("2 * 3 = 6")]);
  });

  it("unescapes a backslash escape and turns a <br> into a line break", () => {
    expect(parseCellInline("a \\* b")).toEqual([text("a * b")]);
    expect(parseCellInline("one<br>two<br/>three")).toEqual([text("one"), { type: "br" }, text("two"), { type: "br" }, text("three")]);
  });

  it("keeps block markup, which a cell cannot hold, as typed", () => {
    expect(parseCellInline("# not a heading")).toEqual([text("# not a heading")]);
    expect(parseCellInline("- not a list")).toEqual([text("- not a list")]);
  });
});
