// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { markdownToHtml } from "@/modules/markdown/lib/markdownToHtml";

describe("markdownToHtml", () => {
  it("renders headings, emphasis, mark, sub, sup", () => {
    const html = markdownToHtml("# H1\n\n**b** *i* ==m== H~2~O x^2^\n");
    expect(html).toContain("<h1>H1</h1>");
    expect(html).toContain("<strong>b</strong>");
    expect(html).toContain("<mark>m</mark>");
    expect(html).toContain("<sub>2</sub>");
    expect(html).toContain("<sup>2</sup>");
  });

  it("converts task list syntax to TipTap taskItem markup", () => {
    const html = markdownToHtml("- [x] done\n- [ ] todo\n");
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('data-checked="false"');
  });

  it("converts $$ blocks and inline $ math to data-math nodes, skipping code fences", () => {
    const html = markdownToHtml("$$\nx^2\n$$\n\nInline $a+b$ here\n\n```\n$not math$\n```\n");
    expect(html).toContain('data-math-block="x%5E2"');
    expect(html).toContain('data-math-inline="a%2Bb"');
    expect(html).not.toContain('data-math-inline="not%20math"');
  });

  it("transforms Obsidian callout blockquotes into div[data-callout]", () => {
    const html = markdownToHtml("> [!warning]- Look out\n> Body line\n");
    expect(html).toContain('data-callout="warning"');
    expect(html).toContain('data-callout-folded="true"');
    expect(html).toContain('data-callout-title="Look out"');
  });

  it("parses image size suffix into data-size", () => {
    const html = markdownToHtml("![alt|size=small](img.png)\n");
    expect(html).toContain('data-size="small"');
    expect(html).toContain('alt="alt"');
  });

  it("does not touch wiki links unless enabled", () => {
    expect(markdownToHtml("[[Note]]\n")).not.toContain("data-wiki-link");
    const html = markdownToHtml("[[Note]]\n", {
      wikiLinks: { root: "/ws", entries: [{ title: "Note", path: "/ws/Note.md" }] },
    });
    expect(html).toContain('data-wiki-link');
    expect(html).toContain('data-path="/ws/Note.md"');
  });

  it("honors the pipe alias in wiki links", () => {
    const html = markdownToHtml("[[Note|Shown text]]\n", {
      wikiLinks: { root: "/ws", entries: [{ title: "Note", path: "/ws/Note.md" }] },
    });
    expect(html).toContain(">Shown text</span>");
    expect(html).toContain('data-title="Note"');
  });

  it("preserves empty paragraphs via the <!-- --> sentinel", () => {
    const html = markdownToHtml("a\n\n<!-- -->\n\nb\n");
    expect(html).toContain("<p></p>");
  });
});
