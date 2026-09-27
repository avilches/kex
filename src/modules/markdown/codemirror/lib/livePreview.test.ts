import { markdownLanguage } from "@codemirror/lang-markdown";
import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { planLivePreview } from "@/modules/markdown/codemirror/lib/livePreview";

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
    expect(result).toEqual({ marks: [], hides: [], checkboxes: [] });
  });

  it("styles a heading and hides its marker on an inactive line", () => {
    const text = "# Title\n";
    const result = plan(text);
    expect(result.marks).toContainEqual({ from: 0, to: 7, className: "cm-lp-heading cm-lp-h1" });
    expect(result.hides).toContainEqual({ from: 0, to: 1 });
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

  it("leaves bracketed text with no destination completely undecorated", () => {
    for (const text of ["see [TODO] here\n", "see [[My Note]] here\n"]) {
      const result = plan(text);
      expect(result.marks).toEqual([]);
      expect(result.hides).toEqual([]);
    }
  });

  it("styles a bullet marker but never hides it, active or not", () => {
    const text = "- one\n- two\n";
    const result = plan(text);
    expect(result.hides).toEqual([]);
    expect(result.marks.some((m) => m.className === "cm-lp-bullet")).toBe(true);
  });

  it("emits a checkbox spec for a task item, checked and unchecked", () => {
    // "- [ ] todo\n" is 11 chars (0-10), so line 2 starts at offset 11 and its
    // "[x]" TaskMarker spans 13-16, not 12-15 - verified against a real parse,
    // not hand-counted twice.
    const text = "- [ ] todo\n- [x] done\n";
    const result = plan(text);
    expect(result.checkboxes).toContainEqual({ from: 2, to: 5, checked: false });
    expect(result.checkboxes).toContainEqual({ from: 13, to: 16, checked: true });
  });

  it("emits a checkbox spec for a task item at the very end of the document", () => {
    const result = plan("- [ ] todo");
    expect(result.checkboxes).toEqual([{ from: 2, to: 5, checked: false }]);
  });

  it("keeps checkbox decorations even on the active line", () => {
    const text = "- [ ] todo\n";
    const result = plan(text, [1]);
    expect(result.checkboxes).toContainEqual({ from: 2, to: 5, checked: false });
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
    for (const active of [[], [2]]) {
      const result = plan(text, active);
      expect(result.marks).toEqual([{ from: 0, to: text.length - 1, className: "cm-lp-codeblock" }]);
      expect(result.hides).toEqual([]);
      expect(result.checkboxes).toEqual([]);
    }
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
