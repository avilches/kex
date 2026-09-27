// @vitest-environment happy-dom
import { forceParsing, syntaxTreeAvailable } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";
import { livePreviewPlugin } from "@/modules/markdown/codemirror/lib/livePreviewPlugin";

function mount(doc: string, selection?: { anchor: number }) {
  const state = EditorState.create({
    doc,
    selection: selection ? { anchor: selection.anchor } : undefined,
    extensions: [markdown({ base: markdownLanguage }), livePreviewPlugin],
  });
  return new EditorView({ state, parent: document.body });
}

describe("livePreviewPlugin", () => {
  it("hides the heading marker when the cursor is elsewhere", () => {
    const view = mount("# Title\n\nOther line", { anchor: 19 });
    expect(view.dom.textContent).not.toContain("#");
    expect(view.dom.textContent).toContain("Title");
    view.destroy();
  });

  it("reveals the heading marker when the cursor is on that line", () => {
    const view = mount("# Title\n\nOther line", { anchor: 3 });
    expect(view.dom.textContent).toContain("# Title");
    view.destroy();
  });

  it("renders a real checkbox input for a task item", () => {
    const view = mount("- [ ] todo\n");
    const checkbox = view.dom.querySelector('input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    view.destroy();
  });

  it("toggles the underlying text when the checkbox is clicked", () => {
    const view = mount("- [ ] todo\n");
    const checkbox = view.dom.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(view.state.doc.toString()).toBe("- [x] todo\n");
    view.destroy();
  });

  it("decorates content past the initial parse boundary once the background parse lands", () => {
    // Few, long lines: past the ~3000-char initial parse, but still few enough
    // lines to sit inside happy-dom's rendered viewport.
    const filler = `${"plain filler prose ".repeat(40)}\n\n`.repeat(6);
    const doc = `${filler}**late**\n`;
    const view = mount(doc, { anchor: 0 });
    const lateLine = () =>
      Array.from(view.dom.querySelectorAll(".cm-line")).find((l) => l.textContent?.includes("late"));
    // The initial synchronous parse stops well before the end of this document.
    expect(syntaxTreeAvailable(view.state, doc.length)).toBe(false);
    expect(lateLine()?.textContent).toBe("**late**");
    // Finishing the parse dispatches a transaction that changes only the tree.
    forceParsing(view, doc.length, 5000);
    expect(syntaxTreeAvailable(view.state, doc.length)).toBe(true);
    expect(lateLine()?.textContent).toBe("late");
    view.destroy();
  });

  it("never decorates the frontmatter block", () => {
    const view = mount("---\ntitle: **not bold**\n---\n# Real\n", { anchor: 0 });
    // The frontmatter's own ** stays literal; only "Real" (after the closing ---) is a heading.
    const bodyText = view.dom.textContent ?? "";
    expect(bodyText).toContain("title: **not bold**");
    view.destroy();
  });
});
