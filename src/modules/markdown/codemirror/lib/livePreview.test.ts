import { markdownLanguage } from "@codemirror/lang-markdown";
import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  linkDefinitions,
  planLivePreview,
  planParagraphJoins,
  planTables,
} from "@/modules/markdown/codemirror/lib/livePreview";

function joins(text: string, activeLines: number[] = [], frontmatterEnd = 0) {
  return planParagraphJoins({
    tree: markdownLanguage.parser.parse(text),
    doc: Text.of(text.split("\n")),
    activeLines: new Set(activeLines),
    frontmatterEnd,
  });
}

describe("planParagraphJoins", () => {
  it("joins the source lines of one paragraph but never across a blank line", () => {
    expect(joins("a\nb\nc\n\nd\n")).toEqual([
      { from: 1, to: 2 },
      { from: 3, to: 4 },
    ]);
  });

  it("drops trailing spaces from the joined range so the join adds exactly one space", () => {
    expect(joins("a \nb\n")).toEqual([{ from: 1, to: 3 }]);
  });

  it("keeps a hard break (two trailing spaces or a backslash) as a real line break", () => {
    expect(joins("a  \nb\n")).toEqual([]);
    expect(joins("a\\\nb\n")).toEqual([]);
    expect(joins("a\\\\\nb\n")).toEqual([{ from: 3, to: 4 }]);
  });

  it("does not join a paragraph while any of its lines is active", () => {
    expect(joins("a\nb\nc\n", [2])).toEqual([]);
  });

  it("swallows the quote markers and the indentation of a continuation line", () => {
    expect(joins("> a\n> b\n")).toEqual([{ from: 3, to: 6 }]);
    expect(joins("- a\n  b\n")).toEqual([{ from: 3, to: 6 }]);
    expect(joins("> > a\n> > b\n")).toEqual([{ from: 5, to: 10 }]);
  });

  it("leaves code, tables, headings and the frontmatter alone", () => {
    expect(joins("```\na\nb\n```\n")).toEqual([]);
    expect(joins("| a | b |\n|---|---|\n| 1 | 2 |\n")).toEqual([]);
    expect(joins("# a\n# b\n")).toEqual([]);
    expect(joins("---\na: 1\nb: 2\n---\nc\n", [], 15)).toEqual([]);
  });
});

function plan(
  text: string,
  activeLines: number[] = [],
  frontmatterEnd = 0,
) {
  const doc = Text.of(text.split("\n"));
  const tree = markdownLanguage.parser.parse(text);
  return planLivePreview({
    tree,
    doc,
    from: 0,
    to: text.length,
    activeLines: new Set(activeLines),
    frontmatterEnd,
  });
}

describe("planLivePreview", () => {
  it("returns nothing for plain prose", () => {
    const result = plan("Just a sentence with no markup.\n");
    expect(result).toEqual({
      marks: [],
      hides: [],
      checkboxes: [],
      tables: [],
      codeBlocks: [],
      hrs: [],
      bullets: [],
      images: [],
      quoteLines: [],
      listLines: [],
      headingLines: [],
      codeHeaders: [],
    });
  });

  it("styles a heading and hides its marker, with the space after it, on an inactive line", () => {
    const text = "# Title\n";
    const result = plan(text);
    expect(result.marks).toContainEqual({ from: 0, to: 7, className: "cm-lp-heading cm-lp-h1" });
    expect(result.hides).toContainEqual({ from: 0, to: 2 });
  });

  it("keeps the heading style but reveals the marker on the active line", () => {
    const text = "# Title\n";
    const result = plan(text, [1]);
    expect(result.marks).toContainEqual({ from: 0, to: 7, className: "cm-lp-heading cm-lp-h1" });
    expect(result.hides).toEqual([]);
  });

  it("hides both asterisks of bold text on an inactive line", () => {
    const text = "before **bold** after\n";
    const result = plan(text);
    expect(result.marks).toContainEqual({ from: 7, to: 15, className: "cm-lp-bold" });
    expect(result.hides).toContainEqual({ from: 7, to: 9 });
    expect(result.hides).toContainEqual({ from: 13, to: 15 });
  });

  it("hides both underscores of italic text on an inactive line", () => {
    const text = "before _italic_ after\n";
    const result = plan(text);
    expect(result.marks).toContainEqual({ from: 7, to: 15, className: "cm-lp-italic" });
    expect(result.hides.length).toBe(2);
  });

  it("hides strikethrough markers", () => {
    const text = "before ~~gone~~ after\n";
    const result = plan(text);
    expect(result.marks).toContainEqual({ from: 7, to: 15, className: "cm-lp-strike" });
  });

  it("hides backticks around inline code", () => {
    const text = "run `ls -la` now\n";
    const result = plan(text);
    expect(result.marks).toContainEqual({ from: 4, to: 12, className: "cm-lp-code" });
    expect(result.hides).toContainEqual({ from: 4, to: 5 });
    expect(result.hides).toContainEqual({ from: 11, to: 12 });
  });

  it("hides link brackets and the URL, keeping the link text visible", () => {
    const text = "see [the docs](https://example.com) here\n";
    const result = plan(text);
    // "[" "]" "(" URL ")" are hidden; "the docs" (offsets 5-13) stays.
    expect(result.hides).toContainEqual({ from: 4, to: 5 });
    expect(result.hides.some((h) => text.slice(h.from, h.to) === "https://example.com")).toBe(true);
    expect(result.marks).toContainEqual({ from: 5, to: 13, className: "cm-lp-link-text" });
  });

  it("keeps bracketed text with no destination as plain text: nothing hidden, never a link", () => {
    const result = plan("see [TODO] here\n");
    expect(result.hides).toEqual([]);
    // Marked so the theme's link color can be taken back off it.
    expect(result.marks).toEqual([{ from: 4, to: 10, className: "cm-lp-notlink" }]);
  });

  it("plans a [[wiki link]]: label marked, brackets hidden off the active line", () => {
    const text = "see [[My Note]] here\n";
    const result = plan(text);
    expect(result.marks).toEqual([{ from: 6, to: 13, className: "cm-lp-wikilink", title: "My Note" }]);
    expect(result.hides).toEqual([
      { from: 4, to: 6 },
      { from: 13, to: 15 },
    ]);
  });

  it("hides the target and the pipe of an aliased wiki link, and shows it raw on the active line", () => {
    const text = "[[Note#Head|the alias]]\n";
    expect(plan(text).hides).toEqual([
      { from: 0, to: 12 },
      { from: 21, to: 23 },
    ]);
    expect(plan(text, [1]).hides).toEqual([]);
  });

  it("leaves [[wiki]] inside inline code alone", () => {
    expect(plan("`[[My Note]]`\n").marks.every((m) => m.className !== "cm-lp-wikilink")).toBe(true);
  });

  it("styles a bullet marker but never hides it, active or not", () => {
    const text = "- one\n- two\n";
    const result = plan(text);
    expect(result.hides).toEqual([]);
    expect(result.marks.some((m) => m.className === "cm-lp-bullet")).toBe(true);
  });

  it("plans a bullet-glyph replacement for an unordered marker on an inactive line", () => {
    const text = "- one\n- two\n";
    const result = plan(text);
    expect(result.bullets).toEqual([
      { from: 0, to: 1 },
      { from: 6, to: 7 },
    ]);
  });

  it("does not replace an unordered marker on its own active line", () => {
    const text = "- one\n- two\n";
    const result = plan(text, [2]);
    expect(result.bullets).toEqual([{ from: 0, to: 1 }]);
  });

  it("never plans a bullet-glyph replacement for an ordered marker", () => {
    const text = "1. one\n2. two\n";
    const result = plan(text);
    expect(result.bullets).toEqual([]);
    expect(result.marks.some((m) => m.className === "cm-lp-bullet")).toBe(true);
  });

  it("styles a blockquote in full and hides its > marker on an inactive line", () => {
    const text = "> quoted\n";
    const result = plan(text);
    expect(result.marks).toContainEqual({ from: 0, to: 8, className: "cm-lp-quote" });
    expect(result.hides).toContainEqual({ from: 0, to: 2 });
  });

  it("reveals the > marker of a blockquote on its own active line, one line at a time", () => {
    const text = "> line one\n> line two\n";
    const secondMarker = text.indexOf(">", 1);
    // Line 1 is inactive (its marker is hidden); line 2 is active (its own
    // marker stays visible), even though both belong to the same Blockquote.
    const result = plan(text, [2]);
    expect(result.hides).toEqual([{ from: 0, to: 2 }]);
    expect(result.hides.some((h) => h.from === secondMarker)).toBe(false);
  });

  it("hides nested quote markers together with however many spaces separate them", () => {
    const text = ">  >   deep\n";
    const result = plan(text);
    expect(result.hides).toEqual([
      { from: 0, to: 3 },
      { from: 3, to: 7 },
    ]);
  });

  it("hides a quote marker's leading indentation too, but not text before it", () => {
    expect(plan("  > indented\n").hides).toEqual([{ from: 0, to: 4 }]);
  });

  it("gives every line of a quote its nesting depth, lazy continuation lines included", () => {
    const text = "> a\n> > b\nlazy\n\nplain\n";
    const result = plan(text);
    expect(result.quoteLines).toEqual([
      { from: 0, depth: 1, indent: 0 },
      { from: 4, depth: 2, indent: 0 },
      { from: 10, depth: 2, indent: 0 },
    ]);
  });

  it("tells a quote inside a list item (indented) from a list inside a quote (not)", () => {
    const inList = plan("- item\n\n  > quoted\n");
    expect(inList.quoteLines).toEqual([{ from: 8, depth: 1, indent: 1 }]);
    const inQuote = plan("> - item\n");
    expect(inQuote.quoteLines).toEqual([{ from: 0, depth: 1, indent: 0 }]);
    expect(inQuote.listLines).toEqual([{ from: 0, depth: 1 }]);
  });

  it("gives every list line its nesting depth, so only nested items get indented", () => {
    const text = "- one\n  - two\n    - three\n\nplain\n";
    const result = plan(text);
    expect(result.listLines).toEqual([
      { from: 0, depth: 1 },
      { from: 6, depth: 2 },
      { from: 14, depth: 3 },
    ]);
  });

  it("counts the depth of nested ordered lists the same way", () => {
    const result = plan("1. one\n   1. two\n");
    expect(result.listLines).toEqual([
      { from: 0, depth: 1 },
      { from: 7, depth: 2 },
    ]);
  });

  it("gives each ATX heading line its level, and nothing else", () => {
    const result = plan("# a\n\ntext\n\n### b\n");
    expect(result.headingLines).toEqual([
      { from: 0, level: 1 },
      { from: 11, level: 3 },
    ]);
  });

  it("plans a HorizontalRule replacement on an inactive line, never on its own active line", () => {
    const text = "before\n\n---\n\nafter\n";
    const hrFrom = text.indexOf("---");
    const inactive = plan(text);
    expect(inactive.hrs).toEqual([{ from: hrFrom, to: hrFrom + 3 }]);
    const active = plan(text, [text.slice(0, hrFrom).split("\n").length]);
    expect(active.hrs).toEqual([]);
  });

  it("plans an Image replacement with its alt text and URL on an inactive line", () => {
    const text = "before\n\n![a cat](cat.png)\n\nafter\n";
    const from = text.indexOf("![a cat]");
    const to = text.indexOf("(cat.png)") + "(cat.png)".length;
    const result = plan(text);
    expect(result.images).toEqual([{ from, to, alt: "a cat", url: "cat.png" }]);
  });

  it("never plans an Image replacement on its own active line", () => {
    const text = "![a cat](cat.png)\n";
    const result = plan(text, [1]);
    expect(result.images).toEqual([]);
  });

  it("emits a checkbox spec for a task item, checked and unchecked", () => {
    // "- [ ] todo\n" is 11 chars (0-10), so line 2 starts at offset 11 and its
    // "[x]" TaskMarker spans 13-16, not 12-15 - verified against a real parse,
    // not hand-counted twice.
    const text = "- [ ] todo\n- [x] done\n";
    const result = plan(text);
    expect(result.checkboxes).toContainEqual({ from: 2, to: 5, checked: false, replaceFrom: 0 });
    expect(result.checkboxes).toContainEqual({ from: 13, to: 16, checked: true, replaceFrom: 11 });
  });

  it("emits a checkbox spec for a task item at the very end of the document", () => {
    const result = plan("- [ ] todo");
    expect(result.checkboxes).toEqual([{ from: 2, to: 5, checked: false, replaceFrom: 0 }]);
  });

  it("leaves a task item as plain editable text while its line is active", () => {
    const text = "- [ ] todo\n- [x] done\n";
    const result = plan(text, [1]);
    // Only the other line's checkbox is rendered.
    expect(result.checkboxes).toEqual([{ from: 13, to: 16, checked: true, replaceFrom: 11 }]);
    expect(result.bullets).toEqual([]);
  });

  it("replaces a task item's dash with its checkbox instead of adding a bullet next to it", () => {
    const result = plan("- plain\n- [ ] task\n");
    expect(result.bullets).toEqual([{ from: 0, to: 1 }]);
    expect(result.checkboxes).toEqual([{ from: 10, to: 13, checked: false, replaceFrom: 8 }]);
  });

  it("keeps the number of an ordered task item", () => {
    const result = plan("1. [ ] task\n");
    expect(result.checkboxes).toEqual([{ from: 3, to: 6, checked: false, replaceFrom: 3 }]);
  });

  it("styles an embedded HTML block as monospace, never as markdown, and never throws", () => {
    const text = '<div class="note">raw html, **not markdown** in here</div>\n\n# Real heading\n';
    const headingStart = text.indexOf("# Real heading");
    expect(() => plan(text)).not.toThrow();
    const result = plan(text);
    const htmlMark = result.marks.find((m) => m.className === "cm-lp-html");
    expect(htmlMark).toBeDefined();
    expect(htmlMark?.from).toBe(0);
    expect((htmlMark?.to ?? 0) <= headingStart).toBe(true);
    const contentMarks = result.marks.filter((m) => m.className !== "cm-lp-html");
    expect(contentMarks.every((m) => m.from >= headingStart)).toBe(true);
    expect(result.hides.every((h) => h.from >= headingStart)).toBe(true);
    expect(contentMarks).toContainEqual({
      from: headingStart,
      to: headingStart + "# Real heading".length,
      className: "cm-lp-heading cm-lp-h1",
    });
  });

  it("styles a fenced code block as one block and never decorates its content", () => {
    const text = "```js\nconst x = 1;\n**not bold** `x`\n```\n";
    const closeLine = text.lastIndexOf("```");
    // Off the block its two fence lines are collapsed; with the cursor inside, nothing is.
    expect(plan(text).codeBlocks).toEqual([{ from: 0, to: text.length - 1, collapsed: [0, closeLine] }]);
    expect(plan(text, [2]).codeBlocks).toEqual([{ from: 0, to: text.length - 1 }]);
    for (const active of [[], [2]]) {
      const result = plan(text, active);
      expect(result.marks).toEqual([]);
      expect(result.checkboxes).toEqual([]);
    }
  });

  it("flags a block no language highlights as plain: untagged, unknown tag or indented, never a known one", () => {
    expect(plan("```js\nx\n```\n").codeBlocks[0].plain).toBeUndefined();
    expect(plan("```\nx\n```\n").codeBlocks[0].plain).toBe(true);
    expect(plan("```nolang\nx\n```\n").codeBlocks[0].plain).toBe(true);
    expect(plan("```  py title=x\nx\n```\n").codeBlocks[0].plain).toBeUndefined();
    expect(plan("    x\n").codeBlocks[0].plain).toBe(true);
  });

  it("does not collapse the fence lines of a block with no body, or it would vanish", () => {
    expect(plan("```js\n```\n").codeBlocks).toEqual([{ from: 0, to: 9 }]);
    expect(plan("```js").codeBlocks).toEqual([{ from: 0, to: 5 }]);
  });

  it("turns the opening fence into a header and hides the closing fence while the cursor is outside the block", () => {
    const text = "```js\nconst x = 1;\n```\n";
    const closeFrom = text.lastIndexOf("```");
    const result = plan(text);
    expect(result.codeHeaders).toEqual([{ from: 0, to: 5, lang: "js", code: "const x = 1;" }]);
    expect(result.hides).toEqual([{ from: closeFrom, to: closeFrom + 3 }]);
  });

  it("covers the whitespace before the language tag and hands the header the whole body as code", () => {
    const text = "```  javascript\nlet x;\n\nlet y;\n```\n";
    const result = plan(text);
    expect(result.codeHeaders).toEqual([{ from: 0, to: 15, lang: "javascript", code: "let x;\n\nlet y;" }]);
  });

  it("gives a block with no language a header with no tag, and an empty block empty code", () => {
    expect(plan("```\nx\n```\n").codeHeaders).toEqual([{ from: 0, to: 3, lang: "", code: "x" }]);
    expect(plan("```\n```\n").codeHeaders).toEqual([{ from: 0, to: 3, lang: "", code: "" }]);
  });

  it("copies only the code of a fenced block inside a quote", () => {
    const [header] = plan("> ```js\n> const a = 1;\n>\n> b();\n> ```\n").codeHeaders;
    expect(header.code).toBe("const a = 1;\n\nb();");
  });

  it("copies only the code of a fenced block nested in a list item", () => {
    const [header] = plan("- item\n\n  ```js\n  a();\n    b();\n  ```\n").codeHeaders;
    expect(header.code).toBe("a();\n  b();");
  });

  it("keeps the text of a fence that never closes", () => {
    const [header] = plan("```\nx\ny").codeHeaders;
    expect(header.code).toBe("x\ny");
  });

  it("reads an unterminated block's code up to the end of the document", () => {
    expect(plan("```py\nprint(1)\nprint(2)").codeHeaders).toEqual([
      { from: 0, to: 5, lang: "py", code: "print(1)\nprint(2)" },
    ]);
  });

  it("shows the raw fence and language tag while the cursor is inside the block", () => {
    const result = plan("```js\nx\n```\n", [2]);
    expect(result.hides).toEqual([]);
    expect(result.codeHeaders).toEqual([]);
  });

  it("styles subscript and superscript, hiding their ~ and ^ markers off the active line", () => {
    const text = "H~2~O and X^2^\n";
    const sub = text.indexOf("~2~");
    const sup = text.indexOf("^2^");
    const result = plan(text);
    expect(result.marks).toContainEqual({ from: sub, to: sub + 3, className: "cm-lp-sub" });
    expect(result.marks).toContainEqual({ from: sup, to: sup + 3, className: "cm-lp-sup" });
    expect(result.hides).toEqual(
      expect.arrayContaining([
        { from: sub, to: sub + 1 },
        { from: sub + 2, to: sub + 3 },
        { from: sup, to: sup + 1 },
        { from: sup + 2, to: sup + 3 },
      ]),
    );
    expect(plan(text, [1]).hides).toEqual([]);
  });

  it("reveals the fence marks while the cursor is on any line of the block", () => {
    const text = "```js\nconst x = 1;\n```\n";
    const result = plan(text, [2]);
    expect(result.hides).toEqual([]);
  });

  it("treats text indented by four spaces as a code block, blank lines inside it included", () => {
    const text = "text\n\n    one\n\n    two\n\nafter\n";
    const result = plan(text);
    expect(result.codeBlocks).toEqual([{ from: text.indexOf("one"), to: text.indexOf("two") + 3, plain: true }]);
    // Off the block, the four-space indentation of each code line is hidden.
    const one = text.indexOf("one");
    const two = text.indexOf("two");
    expect(result.hides).toEqual([
      { from: one - 4, to: one },
      { from: two - 4, to: two },
    ]);
    // With the cursor inside, the raw indentation stays.
    expect(plan(text, [3]).hides).toEqual([]);
  });

  it("does not treat an indented list item as code", () => {
    expect(plan("- a\n    - nested\n").codeBlocks).toEqual([]);
  });

  describe("autolinks and bare URLs", () => {
    it("shows <url> as a link with its angle brackets hidden, raw while the cursor is on the line", () => {
      const text = "See <https://example.com> now.\n";
      const from = text.indexOf("https");
      const to = from + "https://example.com".length;
      const result = plan(text);
      expect(result.marks).toContainEqual({ from, to, className: "cm-lp-link-text" });
      expect(result.hides).toEqual([
        { from: from - 1, to: from },
        { from: to, to: to + 1 },
      ]);
      expect(plan(text, [1]).hides).toEqual([]);
      expect(plan(text, [1]).marks).toContainEqual({ from, to, className: "cm-lp-link-text" });
    });

    it("shows a bare https:// URL, a www. address and an e-mail address as links, hiding nothing", () => {
      const text = "a https://example.com/x?y=1 b www.example.com c me@example.com d\n";
      const result = plan(text);
      const links = result.marks.filter((m) => m.className === "cm-lp-link-text");
      expect(links.map((m) => text.slice(m.from, m.to))).toEqual([
        "https://example.com/x?y=1",
        "www.example.com",
        "me@example.com",
      ]);
      expect(result.hides).toEqual([]);
    });

    it("does not mark the destination of an inline link or a reference definition a second time", () => {
      const text = "[a](https://x.com) and [b]\n\n[b]: https://y.com\n";
      const links = plan(text).marks.filter((m) => m.className === "cm-lp-link-text");
      expect(links.map((m) => text.slice(m.from, m.to))).toEqual(["a", "b"]);
    });
  });

  describe("reference links", () => {
    const DEF = '\n\n[ref-id]: https://github.com "GitHub"\n';

    it("shows a bare [label] naming a definition as a link, with the definition's title as tooltip", () => {
      const text = `See [ref-id] now.${DEF}`;
      const from = text.indexOf("[ref-id]");
      const result = plan(text);
      expect(result.marks).toContainEqual({
        from: from + 1,
        to: from + 7,
        className: "cm-lp-link-text",
        title: "GitHub",
      });
      expect(result.hides).toContainEqual({ from, to: from + 1 });
      expect(result.hides).toContainEqual({ from: from + 7, to: from + 8 });
    });

    it("hides the definition line entirely, until the cursor is on it", () => {
      const text = `See [ref-id] now.${DEF}`;
      const defFrom = text.indexOf("[ref-id]:");
      const defTo = text.indexOf("\n", defFrom);
      expect(plan(text).hides).toContainEqual({ from: defFrom, to: defTo });
      const active = plan(text, [3]);
      expect(active.hides.some((h) => h.from >= defFrom)).toBe(false);
    });

    it("leaves a bracketed word alone when no definition carries its label", () => {
      const result = plan("Just [TODO] here.\n\n[other]: https://x.com\n");
      expect(result.marks.some((m) => m.className === "cm-lp-link-text")).toBe(false);
      // Nothing on the first line ("Just [TODO] here." is 17 characters) is hidden.
      expect(result.hides.some((h) => h.from < 17)).toBe(false);
    });

    it("resolves [text][label] and [text][] and ignores label case and inner whitespace", () => {
      const text = "A [one][Ref  ID] B [ref id][] C\n\n[ref id]: https://x.com\n";
      const result = plan(text);
      const links = result.marks.filter((m) => m.className === "cm-lp-link-text");
      expect(links.map((m) => text.slice(m.from, m.to))).toEqual(["one", "ref id"]);
      const first = text.indexOf("[one]");
      expect(result.hides).toContainEqual({ from: first, to: first + 1 });
      // The closing "]" and the whole "[Ref  ID]" label go with the opening "[".
      expect(result.hides).toContainEqual({ from: first + 4, to: first + 5 });
      expect(result.hides).toContainEqual({ from: first + 5, to: first + 14 });
    });

    it("finds a definition anywhere in the document, including far below the link", () => {
      const text = `[far]\n\n${"filler\n\n".repeat(50)}[far]: https://x.com\n`;
      const result = planLivePreview({
        tree: markdownLanguage.parser.parse(text),
        doc: Text.of(text.split("\n")),
        from: 0,
        to: 10,
        activeLines: new Set(),
        frontmatterEnd: 0,
      });
      expect(result.marks.some((m) => m.className === "cm-lp-link-text")).toBe(true);
    });

    it("takes the first of two definitions with the same label", () => {
      const text = "[a]\n\n[a]: https://first.com\n[a]: https://second.com\n";
      const url = linkDefinitions(markdownLanguage.parser.parse(text), Text.of(text.split("\n")), 0).get("a")?.url;
      expect(url).toBe("https://first.com");
    });

    it("strips the angle brackets of a <url> destination", () => {
      const text = "[a]\n\n[a]: <https://x.com/a>\n";
      const url = linkDefinitions(markdownLanguage.parser.parse(text), Text.of(text.split("\n")), 0).get("a")?.url;
      expect(url).toBe("https://x.com/a");
    });

    it("resolves an image by reference, with its definition's URL and title", () => {
      const text = `Pic ![Logo][ref-id] here.${DEF}`;
      const from = text.indexOf("![Logo]");
      const result = plan(text);
      expect(result.images).toEqual([
        { from, to: from + "![Logo][ref-id]".length, alt: "Logo", url: "https://github.com", title: "GitHub" },
      ]);
    });

    it("gives an inline link its own title as tooltip", () => {
      const text = 'A [docs](https://x.com "The docs") link.\n';
      const from = text.indexOf("[docs]");
      expect(plan(text).marks).toContainEqual({
        from: from + 1,
        to: from + 5,
        className: "cm-lp-link-text",
        title: "The docs",
      });
    });
  });

  const TABLE =
    "| Name | Link | N | Plain |\n" +
    "|:---|:---:|---:|---|\n" +
    "| **a** | [the docs](https://example.com) | 1 | x |\n" +
    "| b |  | 2 |\n" +
    "\nafter\n";
  const TABLE_END = TABLE.indexOf("\n\nafter");

  it("plans an inactive table as a TableSpec and decorates nothing inside it", () => {
    const result = plan(TABLE);
    expect(result.tables).toEqual([
      {
        from: 0,
        to: TABLE_END,
        listDepth: 0,
        headers: ["Name", "Link", "N", "Plain"],
        aligns: ["left", "center", "right", null],
        rows: [
          ["**a**", "[the docs](https://example.com)", "1", "x"],
          // An empty cell keeps its column; a short row is padded to the header width.
          ["b", "", "2", ""],
        ],
      },
    ]);
    expect(result.marks.filter((m) => m.from < TABLE_END)).toEqual([]);
    expect(result.hides.filter((h) => h.from < TABLE_END)).toEqual([]);
  });

  it("plans no TableSpec while the cursor is on any line of the table", () => {
    for (const line of [1, 2, 3, 4]) {
      const result = plan(TABLE, [line]);
      expect(result.tables).toEqual([]);
    }
    // Active: the raw source decorates normally again, e.g. the bold cell.
    expect(plan(TABLE, [1]).marks.some((m) => m.className === "cm-lp-bold")).toBe(true);
  });

  it("reads cells of a table written without outer pipes and unescapes \\|", () => {
    const result = plan("a | b\n--|--\nx \\| y | z\n");
    expect(result.tables[0]?.headers).toEqual(["a", "b"]);
    expect(result.tables[0]?.rows).toEqual([["x | y", "z"]]);
  });

  it("renders a table nested in a list item, replacing its lines from their start, with the item's depth", () => {
    const text = "- item\n\n  | a | b |\n  |---|---|\n  | 1 | 2 |\n";
    const from = text.indexOf("  | a");
    const expected = [
      { from, to: text.length - 1, listDepth: 1, headers: ["a", "b"], aligns: [null, null], rows: [["1", "2"]] },
    ];
    expect(plan(text).tables).toEqual(expected);
    const doc = Text.of(text.split("\n"));
    const tree = markdownLanguage.parser.parse(text);
    expect(planTables({ tree, doc, activeLines: new Set(), frontmatterEnd: 0 })).toEqual(expected);
  });

  it("counts each list level a table sits in", () => {
    const text = "- a\n  - b\n\n    | x |\n    |---|\n    | 1 |\n";
    const doc = Text.of(text.split("\n"));
    const tree = markdownLanguage.parser.parse(text);
    const tables = planTables({ tree, doc, activeLines: new Set(), frontmatterEnd: 0 });
    expect(tables.map((t) => t.listDepth)).toEqual([2]);
  });

  it("leaves a table inside a blockquote as raw source", () => {
    const text = "> | a | b |\n> |---|---|\n> | 1 | 2 |\n";
    expect(plan(text).tables).toEqual([]);
    const doc = Text.of(text.split("\n"));
    const tree = markdownLanguage.parser.parse(text);
    expect(planTables({ tree, doc, activeLines: new Set(), frontmatterEnd: 0 })).toEqual([]);
  });

  it("hides the quote markers of a fenced block inside a quote, including its opening and closing lines", () => {
    const text = "> Cita:\n>\n> ```python\n> print(1)\n> ```\n";
    const result = plan(text);
    const hidden = result.hides.map((h) => text.slice(h.from, h.to));
    // Every line's "> " goes: the paragraph's, the empty one's, the fence lines' and the code line's.
    expect(hidden.filter((h) => h.startsWith(">")).length).toBe(5);
    expect(hidden).toContain("```");
  });

  it("shows every marker of a quoted fenced block raw while the cursor is inside it", () => {
    const text = "> ```python\n> print(1)\n> ```\n";
    const result = plan(text, [2]);
    expect(result.hides.filter((h) => text.slice(h.from, h.to).startsWith(">"))).toEqual([]);
  });

  it("hides the list indentation of a fenced block's code lines, so they sit at one place", () => {
    const text = "1. Lista:\n\n   ```bash\n   echo hola\n   ```\n";
    const code = text.indexOf("echo");
    const result = plan(text);
    expect(result.hides).toContainEqual({ from: code - 3, to: code });
    expect(plan(text, [4]).hides.some((h) => h.to === code)).toBe(false);
  });

  it("planTables finds the same top-level tables across the whole document", () => {
    const doc = Text.of(TABLE.split("\n"));
    const tree = markdownLanguage.parser.parse(TABLE);
    const all = planTables({ tree, doc, activeLines: new Set(), frontmatterEnd: 0 });
    expect(all).toEqual(plan(TABLE).tables);
    expect(planTables({ tree, doc, activeLines: new Set([2]), frontmatterEnd: 0 })).toEqual([]);
  });

  it("styles the frontmatter block as monospace, never as markdown", () => {
    const text = "---\ntitle: **not bold**\n---\n# Real Title\n";
    const fmEnd = "---\ntitle: **not bold**\n---\n".length;
    const result = plan(text, [], fmEnd);
    expect(result.marks).toContainEqual({ from: 0, to: fmEnd, className: "cm-lp-frontmatter" });
    const contentMarks = result.marks.filter((m) => m.className !== "cm-lp-frontmatter");
    expect(contentMarks.every((m) => m.from >= fmEnd)).toBe(true);
    expect(result.hides.every((h) => h.from >= fmEnd)).toBe(true);
    expect(contentMarks).toContainEqual({
      from: fmEnd,
      to: fmEnd + "# Real Title".length,
      className: "cm-lp-heading cm-lp-h1",
    });
  });

  it("supports more than one active line (multi-cursor)", () => {
    const text = "**a**\n**b**\n**c**\n";
    const result = plan(text, [1, 3]);
    // Line 1 (offset 0-5) and line 3 (offset 12-17) are active: no hides there.
    // Line 2 (offset 6-11) is inactive: its marks are hidden.
    const line2Hides = result.hides.filter((h) => h.from >= 6 && h.to <= 11);
    expect(line2Hides.length).toBe(2);
    const line1Hides = result.hides.filter((h) => h.from >= 0 && h.to <= 5);
    const line3Hides = result.hides.filter((h) => h.from >= 12 && h.to <= 17);
    expect(line1Hides.length).toBe(0);
    expect(line3Hides.length).toBe(0);
  });

  it("bounds work to the given viewport, ignoring nodes outside it", () => {
    const text = "**a**\n".repeat(100);
    const midpoint = Math.floor(text.length / 2);
    const doc = Text.of(text.split("\n"));
    const tree = markdownLanguage.parser.parse(text);
    const result = planLivePreview({
      tree,
      doc,
      from: 0,
      to: midpoint,
      activeLines: new Set(),
      frontmatterEnd: 0,
    });
    expect(result.marks.every((m) => m.from < midpoint)).toBe(true);
  });
});
