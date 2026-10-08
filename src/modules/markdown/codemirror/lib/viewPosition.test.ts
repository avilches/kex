// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { applyViewPosition, readViewPosition } from "@/modules/markdown/codemirror/lib/viewPosition";

const views: EditorView[] = [];

function mount(doc: string): EditorView {
  const view = new EditorView({ state: EditorState.create({ doc }), parent: document.body });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const v of views.splice(0)) v.destroy();
});

describe("view position", () => {
  const doc = "one\ntwo words\nthree\n";

  it("puts the cursor on the saved line and column", () => {
    const view = mount(doc);
    applyViewPosition(view, { cursorLine: 2, cursorCol: 4, topLine: 1 });
    expect(readViewPosition(view)).toMatchObject({ cursorLine: 2, cursorCol: 4 });
  });

  it("clamps a line or column that no longer exists", () => {
    const view = mount(doc);
    applyViewPosition(view, { cursorLine: 99, cursorCol: 99, topLine: 99 });
    const { cursorLine, cursorCol } = readViewPosition(view);
    expect(cursorLine).toBe(view.state.doc.lines);
    expect(cursorCol).toBe(view.state.doc.line(cursorLine).length);
  });
});
