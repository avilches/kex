// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { htmlToMarkdown } from "@/modules/markdown/lib/htmlToMarkdown";
import { markdownToHtml } from "@/modules/markdown/lib/markdownToHtml";
import { RawComment } from "@/modules/markdown/rich/extensions/rawComment";

// Full save path, ProseMirror included: it is the DOM -> document parse that used to
// drop HTML comments, so the pure markdownToHtml/htmlToMarkdown pair cannot prove this.
function throughEditor(md: string): string {
  const editor = new Editor({
    extensions: [StarterKit, RawComment],
    content: markdownToHtml(md),
  });
  const html = editor.getHTML();
  editor.destroy();
  return htmlToMarkdown(html);
}

describe("RawComment through the editor document", () => {
  it("survives a load and save with no edit in between", () => {
    const input = "intro\n\n<!-- BACKLOG.MD GUIDELINES START -->\n\nbody\n";
    expect(throughEditor(input)).toBe(input);
  });

  it("keeps a comment whose text needs escaping in an attribute", () => {
    const input = 'note\n\n<!-- keep "this" & <that> -->\n\nend\n';
    expect(throughEditor(input)).toBe(input);
  });

  it("is idempotent across a second load and save", () => {
    const md1 = throughEditor("<!-- one -->\n<!-- two -->\n");
    expect(md1).toBe(throughEditor(md1));
    expect(md1).toContain("<!-- one -->");
    expect(md1).toContain("<!-- two -->");
  });

  it("keeps a fenced code block nested in a list item as a block", () => {
    const input = "- item text\n    ```tsx\n    const x = 1;\n    ```\n";
    expect(throughEditor(input)).toBe(input);
  });
});
