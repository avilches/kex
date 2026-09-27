import { syntaxTree } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { frontmatterEnd } from "@/modules/markdown/codemirror/lib/frontmatterEnd";
import { planLivePreview } from "@/modules/markdown/codemirror/lib/livePreview";

class CheckboxWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly checked: boolean,
  ) {
    super();
  }

  override eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.from === this.from;
  }

  override toDOM(view: EditorView): HTMLElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className = "cm-lp-checkbox";
    input.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const insert = this.checked ? " " : "x";
      view.dispatch({ changes: { from: this.from + 1, to: this.from + 2, insert } });
    });
    return input;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const activeLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let line = startLine; line <= endLine; line++) activeLines.add(line);
  }

  const fmEnd = frontmatterEnd(state.doc.sliceString(0, Math.min(state.doc.length, 4096)));

  const decorations: { from: number; to: number; deco: Decoration }[] = [];
  for (const { from, to } of view.visibleRanges) {
    const plan = planLivePreview({
      tree: syntaxTree(state),
      doc: state.doc,
      from,
      to,
      activeLines,
      frontmatterEnd: fmEnd,
    });
    for (const mark of plan.marks) {
      decorations.push({ from: mark.from, to: mark.to, deco: Decoration.mark({ class: mark.className }) });
    }
    for (const hide of plan.hides) {
      decorations.push({ from: hide.from, to: hide.to, deco: Decoration.replace({}) });
    }
    for (const box of plan.checkboxes) {
      decorations.push({
        from: box.from,
        to: box.to,
        deco: Decoration.replace({ widget: new CheckboxWidget(box.from, box.checked) }),
      });
    }
  }

  decorations.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = decorations.map((d) => d.deco.range(d.from, d.to));
  return Decoration.set(builder, true);
}

export const livePreviewPlugin: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
