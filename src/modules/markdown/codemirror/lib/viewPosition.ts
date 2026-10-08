import { EditorView } from "@codemirror/view";
import type { ViewPosition } from "@/modules/markdown/lib/viewPosition";

const clamp = (n: number, min: number, max: number): number => Math.min(Math.max(n, min), max);

// The 1-based line at the top edge of the viewport.
export function topLineOf(view: EditorView): number {
  const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop - view.documentPadding.top);
  return view.state.doc.lineAt(block.from).number;
}

export function readViewPosition(view: EditorView): ViewPosition {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  return { cursorLine: line.number, cursorCol: head - line.from, topLine: topLineOf(view) };
}

export function scrollToTopLine(view: EditorView, line: number): void {
  const target = view.state.doc.line(clamp(line, 1, view.state.doc.lines));
  view.dispatch({ effects: EditorView.scrollIntoView(target.from, { y: "start" }) });
}

export function applyViewPosition(view: EditorView, position: ViewPosition): void {
  const doc = view.state.doc;
  const cursor = doc.line(clamp(position.cursorLine, 1, doc.lines));
  const top = doc.line(clamp(position.topLine, 1, doc.lines));
  view.dispatch({
    selection: { anchor: cursor.from + Math.min(position.cursorCol, cursor.length) },
    effects: EditorView.scrollIntoView(top.from, { y: "start" }),
  });
}
