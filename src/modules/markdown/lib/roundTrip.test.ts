// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "@/modules/markdown/lib/htmlToMarkdown";
import { markdownToHtml } from "@/modules/markdown/lib/markdownToHtml";

const CORPUS: Record<string, string> = {
  headings: "# H1\n\n## H2\n\n###### H6\n",
  paragraphsAndMarks:
    "Plain **bold** *italic* ~~strike~~ `code` <u>under</u> ==mark== H~2~O x^2^\n",
  markColor: '<mark data-color="rgba(250, 230, 100, 0.25)">colored</mark>\n',
  nestedLists: "- a\n- b\n    - b1\n    - b2\n        1. deep\n- c\n",
  orderedStart: "3. three\n4. four\n",
  taskLists: "- [x] done\n- [ ] open\n    - [ ] nested\n",
  table: "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n",
  fencedCode: '```ts\nconst x: number = 1;\nif (x < 2) console.log("a & b");\n```\n',
  fencedCodeNoLang: "```\nplain\n```\n",
  callout: "> [!warning]+ Watch out\n> First line\n> \n> Second paragraph\n",
  calloutBare: "> [!note]\n> Body\n",
  blockquote: "> quoted line\n> second line\n",
  details:
    '<details class="editor-details" open><summary>Title</summary><div data-type="detailsContent"><p>Body</p></div></details>\n',
  mathBlock: "$$\nE = mc^2\n$$\n",
  mathInline: "Inline $a_i + b^2$ math\n",
  mermaid: "```mermaid\ngraph TD\n  A-->B\n```\n",
  links: "[text](https://example.com/a%20b) and <https://example.com>\n",
  linkWithTitle: '[text](https://example.com "My title")\n',
  imageWithSize: "![diagram|size=medium](assets/d.png)\n",
  horizontalRule: "before\n\n---\n\nafter\n",
  pageBreak: '<div style="page-break-after: always;"></div>\n',
  emptyParagraphs: "a\n\n<!-- -->\n\nb\n",
  hardBreak: "line one  \nline two\n",
  frontmatterFree: "no frontmatter here, just text\n",
};

describe("round-trip idempotence", () => {
  for (const [name, md] of Object.entries(CORPUS)) {
    it(`is stable after first normalization: ${name}`, () => {
      const md1 = htmlToMarkdown(markdownToHtml(md));
      const md2 = htmlToMarkdown(markdownToHtml(md1));
      expect(md2).toBe(md1);
    });
  }

  it("preserves task checked state through the trip", () => {
    const md1 = htmlToMarkdown(markdownToHtml("- [x] done\n- [ ] open\n"));
    expect(md1).toContain("- [x] done");
    expect(md1).toContain("- [ ] open");
  });

  it("keeps callout syntax portable", () => {
    const md1 = htmlToMarkdown(markdownToHtml("> [!tip]- Folded\n> Body\n"));
    expect(md1).toContain("> [!tip]- Folded");
    expect(md1).toContain("> Body");
  });

  it("keeps code fences with language intact", () => {
    const md1 = htmlToMarkdown(markdownToHtml("```rust\nfn main() {}\n```\n"));
    expect(md1).toBe("```rust\nfn main() {}\n```\n");
  });

  it("does not throw on an ordinary filename with a literal percent sign", () => {
    const md = htmlToMarkdown('<img src="assets/100%.png" alt="x">');
    expect(md).toBe("![x](assets/100%.png)\n");
  });

  it("is idempotent for a bullet with no own text and only a nested list", () => {
    const input = "- \n    - nested\n";
    const md1 = htmlToMarkdown(markdownToHtml(input));
    const md2 = htmlToMarkdown(markdownToHtml(md1));
    expect(md2).toBe(md1);
    expect(md1).toBe("- \n    - nested\n");
  });

  it("emits a valid GFM table (raw HTML fallback) for a table with no header row", () => {
    const html =
      "<table><tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody></table>";
    const md1 = htmlToMarkdown(html);
    // No `---` separator line was invented for a table that never had a header.
    expect(md1).not.toMatch(/^\|.*\|\n\|\s*---/);
    const md2 = htmlToMarkdown(markdownToHtml(md1));
    expect(md2).toBe(md1);
  });

  it("does not misidentify a header row that isn't row 0 as a body row", () => {
    const html =
      "<table><tbody><tr><td>a</td><td>b</td></tr><tr><th>H1</th><th>H2</th></tr></tbody></table>";
    const md1 = htmlToMarkdown(html);
    // Falls back to raw HTML rather than treating the data row as the header.
    expect(md1).toContain("<th>H1</th>");
    expect(md1).toContain("<td>a</td>");
  });

  it("preserves a trailing hard break at the end of a list item", () => {
    const withSibling = htmlToMarkdown("<ul><li>text<br></li><li>second</li></ul>");
    expect(withSibling).toBe("- text  \n- second\n");

    const withNestedList = htmlToMarkdown("<ul><li>text<br><ul><li>nested</li></ul></li></ul>");
    expect(withNestedList).toBe("- text  \n    - nested\n");
  });

  it("is idempotent for two consecutive trailing hard breaks in a list item", () => {
    const md1 = htmlToMarkdown("<ul><li>text<br><br></li><li>second</li></ul>");
    expect(md1).toBe("- text<br><br>\n- second\n");
    const md2 = htmlToMarkdown(markdownToHtml(md1));
    expect(md2).toBe(md1);
  });

  it("is idempotent for two consecutive trailing hard breaks before a nested list", () => {
    const md1 = htmlToMarkdown("<ul><li>text<br><br><ul><li>nested</li></ul></li></ul>");
    expect(md1).toBe("- text<br><br>\n    - nested\n");
    const md2 = htmlToMarkdown(markdownToHtml(md1));
    expect(md2).toBe(md1);
  });
});
