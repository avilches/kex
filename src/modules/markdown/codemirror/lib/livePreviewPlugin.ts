import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { type EditorState, type Extension, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { isExternalUrl, openExternalUrl } from "@/modules/markdown/codemirror/lib/externalUrl";
import { frontmatterEnd } from "@/modules/markdown/codemirror/lib/frontmatterEnd";
import {
  planLivePreview,
  planTables,
  type TableSpec,
} from "@/modules/markdown/codemirror/lib/livePreview";
import { cellSegments } from "@/modules/markdown/codemirror/lib/tableCellInline";

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

class TableWidget extends WidgetType {
  private readonly key: string;

  constructor(private readonly spec: TableSpec) {
    super();
    this.key = JSON.stringify([spec.headers, spec.aligns, spec.rows]);
  }

  // Positions are left out on purpose: the DOM depends only on the content, so
  // an edit above the table must not rebuild it.
  override eq(other: TableWidget): boolean {
    return other.key === this.key;
  }

  override get estimatedHeight(): number {
    return (this.spec.rows.length + 1) * 33;
  }

  override toDOM(): HTMLElement {
    const { headers, aligns, rows } = this.spec;
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-table-wrap";
    const table = document.createElement("table");
    table.className = "cm-lp-table";
    const thead = table.createTHead().insertRow();
    for (const [i, text] of headers.entries()) thead.appendChild(buildCell("th", text, aligns[i]));
    const tbody = table.createTBody();
    for (const row of rows) {
      const tr = tbody.insertRow();
      for (const [i, text] of row.entries()) tr.appendChild(buildCell("td", text, aligns[i]));
    }
    wrap.appendChild(table);
    return wrap;
  }

  // Clicks on a link belong to the link; any other click goes to the editor,
  // which places the cursor on the table and so reveals its raw source.
  override ignoreEvent(event: Event): boolean {
    return event.target instanceof Element && event.target.closest("a") !== null;
  }
}

function buildCell(tag: "th" | "td", text: string, align: TableSpec["aligns"][number]): HTMLElement {
  const cell = document.createElement(tag);
  if (align) cell.style.textAlign = align;
  for (const segment of cellSegments(text)) {
    if (segment.type === "text") {
      cell.appendChild(document.createTextNode(segment.value));
    } else if (isExternalUrl(segment.url)) {
      cell.appendChild(buildLink(segment.text, segment.url));
    } else {
      cell.appendChild(document.createTextNode(segment.text));
    }
  }
  return cell;
}

function buildLink(text: string, url: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.className = "cm-lp-link-text";
  a.textContent = text;
  a.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    openExternalUrl(url);
  });
  // The webview must never navigate itself to the link.
  a.addEventListener("click", (e) => e.preventDefault());
  return a;
}

function activeLinesOf(state: EditorState): Set<number> {
  const activeLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let line = startLine; line <= endLine; line++) activeLines.add(line);
  }
  return activeLines;
}

function frontmatterEndOf(state: EditorState): number {
  return frontmatterEnd(state.doc.sliceString(0, Math.min(state.doc.length, 4096)));
}

const codeBlockLine = Decoration.line({ class: "cm-lp-codeblock" });

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const activeLines = activeLinesOf(state);
  const fmEnd = frontmatterEndOf(state);

  const decorations: { from: number; to: number; deco: Decoration }[] = [];
  const codeLineStarts = new Set<number>();
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
    // Only the lines inside this visible range; a block straddling two ranges
    // is visited twice, hence the set.
    for (const block of plan.codeBlocks) {
      const first = state.doc.lineAt(Math.max(block.from, from)).number;
      const last = state.doc.lineAt(Math.min(block.to, to)).number;
      for (let n = first; n <= last; n++) codeLineStarts.add(state.doc.line(n).from);
    }
    // plan.tables is rendered by tableField: block widgets cannot come from a plugin.
  }
  for (const pos of codeLineStarts) decorations.push({ from: pos, to: pos, deco: codeBlockLine });

  decorations.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = decorations.map((d) => d.deco.range(d.from, d.to));
  return Decoration.set(builder, true);
}

function buildTableDecorations(state: EditorState): DecorationSet {
  const tables = planTables({
    tree: syntaxTree(state),
    doc: state.doc,
    activeLines: activeLinesOf(state),
    frontmatterEnd: frontmatterEndOf(state),
  });
  return Decoration.set(
    tables.map((spec) => Decoration.replace({ widget: new TableWidget(spec), block: true }).range(spec.from, spec.to)),
  );
}

// CodeMirror only accepts block (multi-line) replace decorations from a state
// field, never from a ViewPlugin, so tables live here instead of in the plugin.
const tableField = StateField.define<DecorationSet>({
  create: buildTableDecorations,
  update(value, tr) {
    if (tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state)) {
      return buildTableDecorations(tr.state);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const inlinePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      // The syntax-tree check catches the background parse that finishes a
      // long document after open, which changes neither doc, selection, nor
      // viewport.
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export const livePreviewPlugin: Extension = [inlinePlugin, tableField];

export function linkUrlAt(state: EditorState, pos: number): string | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  while (node && node.type.name !== "Link") node = node.parent;
  const urlNode = node?.getChild("URL");
  if (!urlNode) return null;
  const url = state.doc.sliceString(urlNode.from, urlNode.to);
  return isExternalUrl(url) ? url : null;
}

// Cmd/Ctrl+click opens a link; a plain click only places the cursor, so the
// link stays editable (Obsidian's live preview behaves the same way). Only the
// primary button counts, so a right-click keeps its context menu.
export function handleLinkMousedown(event: MouseEvent, view: EditorView): boolean {
  if (event.button !== 0) return false;
  if (!event.metaKey && !event.ctrlKey) return false;
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos == null) return false;
  const url = linkUrlAt(view.state, pos);
  if (!url) return false;
  event.preventDefault();
  openExternalUrl(url);
  return true;
}

export const linkClickHandler: Extension = EditorView.domEventHandlers({ mousedown: handleLinkMousedown });
