// @vitest-environment happy-dom

import { CodeMirrorEditor } from "@/modules/markdown/codemirror/CodeMirrorEditor";
import { EditorView } from "@codemirror/view";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// useEditorThemeExt() ultimately reads from the app-wide ThemeProvider and
// settings store, neither of which exist in this isolated render. This
// component's own behavior does not depend on which theme extension it gets,
// so stub it out rather than bootstrapping the whole theme/settings stack.
vi.mock("@/modules/editor/lib/useEditorThemeExt", () => ({
  useEditorThemeExt: () => [],
}));

describe("CodeMirrorEditor", () => {
  it("does not report a change on mount, even with frontmatter and embedded HTML", () => {
    const source =
      '---\ntitle: Note\n---\n\n<div class="note">raw html</div>\n\n# Heading\n';
    const onChange = vi.fn();
    render(<CodeMirrorEditor value={source} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports the exact text back through onChange after an edit, unchanged", () => {
    const onChange = vi.fn();
    const { container } = render(
      <CodeMirrorEditor value="Hello" onChange={onChange} />,
    );
    const dom = container.querySelector(".cm-content") as HTMLElement;
    const view = EditorView.findFromDOM(dom);
    expect(view).not.toBeNull();
    view?.dispatch({ changes: { from: 0, to: 5, insert: "Hi there" } });
    expect(onChange).toHaveBeenCalledWith("Hi there");
    expect(view?.state.doc.toString()).toBe("Hi there");
  });

  it("stays byte-identical after loading and after moving the cursor across every line (AC #4 round-trip)", () => {
    const source =
      '---\ntitle: Note\n---\n\n<div class="note">raw html</div>\n\n# Heading\n\n**bold** and _italic_ and `code`\n\n- [ ] a task\n- a bullet\n';
    const onChange = vi.fn();
    const { container } = render(
      <CodeMirrorEditor value={source} onChange={onChange} />,
    );
    const dom = container.querySelector(".cm-content") as HTMLElement;
    const view = EditorView.findFromDOM(dom);
    expect(view).not.toBeNull();
    if (!view) return;

    // Right after load: no edit happened, so the document must already equal
    // the source exactly.
    expect(view.state.doc.toString()).toBe(source);

    // Move the cursor to the start of every line in turn (this is what drives
    // the ViewPlugin's hide/reveal recompute in livePreviewPlugin) and assert
    // the document text never changes as a side effect of that recompute.
    for (let lineNo = 1; lineNo <= view.state.doc.lines; lineNo++) {
      const linePos = view.state.doc.line(lineNo).from;
      view.dispatch({ selection: { anchor: linePos } });
      expect(view.state.doc.toString()).toBe(source);
    }

    // No edit was ever dispatched, so onChange (which only fires on
    // update.docChanged) must never have been called.
    expect(onChange).not.toHaveBeenCalled();
  });
});
