import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { type EditorState, type Extension, Facet, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { IS_MAC } from "@/lib/platform";
import { autolinkHref, isExternalUrl, openExternalUrl } from "@/modules/markdown/codemirror/lib/externalUrl";
import { frontmatterEnd } from "@/modules/markdown/codemirror/lib/frontmatterEnd";
import { CHECK_ICON, COPY_ICON } from "@/modules/markdown/lib/codeCopyIcons";
import {
  type ImageSpec,
  linkDefinitions,
  NOT_BARE_URL_PARENTS,
  planLivePreview,
  planParagraphJoins,
  planTables,
  resolveReference,
  type TableSpec,
  WIKI_LINK_CLASS,
} from "@/modules/markdown/codemirror/lib/livePreview";
import { wikiLinkAt } from "@/modules/markdown/lib/wikiLinks";
import { type CellNode, parseCellInline } from "@/modules/markdown/codemirror/lib/tableCellInline";

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
      if (view.state.readOnly) return;
      const insert = this.checked ? " " : "x";
      view.dispatch({ changes: { from: this.from + 1, to: this.from + 2, insert } });
    });
    return input;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

class HrWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-lp-hr";
    return div;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

// Stands in for the opening fence of an inactive code block: the language on
// the right, then a copy button.
class CodeHeaderWidget extends WidgetType {
  constructor(
    private readonly lang: string,
    private readonly code: string,
  ) {
    super();
  }

  override eq(other: CodeHeaderWidget): boolean {
    return other.lang === this.lang && other.code === this.code;
  }

  override toDOM(): HTMLElement {
    const header = document.createElement("span");
    header.className = "cm-lp-code-header";
    if (this.lang) {
      const label = document.createElement("span");
      label.className = "cm-lp-code-lang";
      label.textContent = this.lang;
      header.appendChild(label);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-lp-code-copy";
    button.title = "Copy code";
    button.innerHTML = COPY_ICON;
    button.addEventListener("mousedown", (e) => {
      e.preventDefault();
      navigator.clipboard.writeText(this.code).then(
        () => {
          button.innerHTML = CHECK_ICON;
          button.classList.add("copied");
          setTimeout(() => {
            button.innerHTML = COPY_ICON;
            button.classList.remove("copied");
          }, 1500);
        },
        () => {},
      );
    });
    header.appendChild(button);
    return header;
  }

  // The button owns its clicks; a click anywhere else on the header puts the
  // cursor on the fence line, which reveals the raw fence to edit.
  override ignoreEvent(event: Event): boolean {
    return event.target instanceof Element && event.target.closest("button") !== null;
  }
}

class SoftBreakWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.textContent = " ";
    return span;
  }
}

class BulletWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-lp-bullet-dot";
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

class ImageWidget extends WidgetType {
  private readonly key: string;

  constructor(
    private readonly alt: string,
    private readonly src: string,
    private readonly title: string | undefined,
  ) {
    super();
    this.key = `${alt}\u0000${src}\u0000${title ?? ""}`;
  }

  override eq(other: ImageWidget): boolean {
    return other.key === this.key;
  }

  // The img sits in a wrapper because a failed load swaps the img for its alt
  // text, and CodeMirror must keep hold of the same root element.
  override toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    if (this.title) img.title = this.title;
    img.className = "cm-lp-image";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      const broken = document.createElement("span");
      broken.className = "cm-lp-image-broken";
      broken.textContent = this.alt || "image";
      if (this.title) broken.title = this.title;
      wrap.replaceChildren(broken);
    });
    wrap.appendChild(img);
    return wrap;
  }

  // Clicking an image places the cursor on its line, revealing the raw
  // markdown for editing, same as clicking a table.
  override ignoreEvent(): boolean {
    return false;
  }
}

class TableWidget extends WidgetType {
  private readonly key: string;

  constructor(private readonly spec: TableSpec) {
    super();
    this.key = JSON.stringify([spec.listDepth, spec.headers, spec.aligns, spec.rows]);
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
    // Where a line's own text starts (its 6px padding), plus the indent of the
    // list item the table belongs to, so it lines up with that item's text.
    wrap.style.setProperty("--lp-list-depth", String(this.spec.listDepth));
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
  appendCellNodes(cell, parseCellInline(text));
  return cell;
}

const CELL_TAGS = { strong: "strong", em: "em", del: "del", sub: "span", sup: "span" } as const;

function appendCellNodes(parent: HTMLElement, nodes: CellNode[]): void {
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        parent.appendChild(document.createTextNode(node.value));
        break;
      case "br":
        parent.appendChild(document.createElement("br"));
        break;
      case "code": {
        const code = document.createElement("code");
        code.className = "cm-lp-code";
        code.textContent = node.value;
        parent.appendChild(code);
        break;
      }
      case "link":
        // Only an external destination is a link; anything else (a relative
        // path, an anchor) shows its text, as elsewhere in the engine.
        if (isExternalUrl(node.url)) {
          const a = buildLink(node.url);
          appendCellNodes(a, node.children);
          parent.appendChild(a);
        } else {
          appendCellNodes(parent, node.children);
        }
        break;
      default: {
        const el = document.createElement(CELL_TAGS[node.type]);
        if (node.type === "sub" || node.type === "sup") el.className = `cm-lp-${node.type}`;
        appendCellNodes(el, node.children);
        parent.appendChild(el);
      }
    }
  }
}

function buildLink(url: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.className = "cm-lp-link-text";
  a.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    openExternalUrl(url);
  });
  // The webview must never navigate itself to the link. A middle-click fires
  // auxclick, not click, so it needs its own listener.
  a.addEventListener("click", (e) => e.preventDefault());
  a.addEventListener("auxclick", (e) => e.preventDefault());
  return a;
}

// A read-only view has no line being edited, so every line renders decorated
// and nothing shows its raw syntax.
export const staticPreview = Facet.define<boolean, boolean>({ combine: (values) => values.some(Boolean) });

function activeLinesOf(state: EditorState): Set<number> {
  const activeLines = new Set<number>();
  if (state.facet(staticPreview)) return activeLines;
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

// Everything a line's own decoration can carry. A line gets exactly one
// decoration, built from all of it, because two line decorations each setting
// `style` would depend on how CodeMirror merges the attribute.
type LineTraits = {
  code?: boolean;
  plain?: boolean;
  codeFirst?: boolean;
  codeLast?: boolean;
  fence?: boolean;
  quote?: number;
  quoteIndent?: number;
  list?: number;
  heading?: number;
};

const lineDecoCache = new Map<string, Decoration>();

// Depths reach the stylesheet as custom properties: one bar per quote level,
// one indent step per list level below the first.
function lineDecoration(t: LineTraits): Decoration {
  const flags = [t.code, t.plain, t.codeFirst, t.codeLast, t.fence].map((b) => (b ? 1 : 0)).join("");
  const key = `${flags}|${t.quote ?? 0}|${t.quoteIndent ?? 0}|${t.list ?? 0}|${t.heading ?? 0}`;
  let deco = lineDecoCache.get(key);
  if (!deco) {
    const classes: string[] = [];
    const styles: string[] = [];
    if (t.code) classes.push("cm-lp-codeblock");
    if (t.plain) classes.push("cm-lp-code-plain");
    if (t.codeFirst) classes.push("cm-lp-code-first");
    if (t.codeLast) classes.push("cm-lp-code-last");
    if (t.fence) classes.push("cm-lp-fence-line");
    if (t.quote) {
      classes.push("cm-lp-quote-line");
      styles.push(`--lp-quote-depth: ${t.quote}`);
      if (t.quoteIndent) styles.push(`--lp-quote-indent: ${t.quoteIndent}`);
    }
    if (t.list) {
      // A code line in a list is indented by its own rule, and must not pick up
      // the vertical padding of a list line.
      classes.push(t.code ? "cm-lp-list-code" : "cm-lp-list");
      styles.push(`--lp-list-depth: ${t.list}`);
    }
    if (t.heading) classes.push("cm-lp-heading-line", `cm-lp-hl${t.heading}`);
    deco = Decoration.line({
      class: classes.join(" "),
      ...(styles.length > 0 ? { attributes: { style: styles.join("; ") } } : {}),
    });
    lineDecoCache.set(key, deco);
  }
  return deco;
}

function imageWidgetOf(spec: ImageSpec, resolveImageSrc: (src: string) => string): ImageWidget {
  return new ImageWidget(spec.alt, resolveImageSrc(spec.url), spec.title);
}

function buildDecorations(view: EditorView, resolveImageSrc: (src: string) => string): DecorationSet {
  const { state } = view;
  const activeLines = activeLinesOf(state);
  const fmEnd = frontmatterEndOf(state);

  const decorations: { from: number; to: number; deco: Decoration }[] = [];
  // A quote marker on a continuation line lies inside a joined line break, and
  // two replace decorations must not overlap.
  const joined: [number, number][] = [];
  state.field(joinField).between(0, state.doc.length, (from, to) => {
    joined.push([from, to]);
  });
  const lineTraits = new Map<number, LineTraits>();
  const traitsOf = (start: number): LineTraits => {
    let t = lineTraits.get(start);
    if (!t) {
      t = {};
      lineTraits.set(start, t);
    }
    return t;
  };
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
      decorations.push({
        from: mark.from,
        to: mark.to,
        deco: Decoration.mark({
          class: mark.className === WIKI_LINK_CLASS ? wikiLinkClass(state, mark.title) : mark.className,
          ...(mark.title ? { attributes: { title: mark.title } } : {}),
        }),
      });
    }
    for (const hide of plan.hides) {
      if (joined.some(([f, t]) => hide.from >= f && hide.to <= t)) continue;
      decorations.push({ from: hide.from, to: hide.to, deco: Decoration.replace({}) });
    }
    for (const box of plan.checkboxes) {
      decorations.push({
        from: box.replaceFrom,
        to: box.to,
        deco: Decoration.replace({ widget: new CheckboxWidget(box.from, box.checked) }),
      });
    }
    for (const header of plan.codeHeaders) {
      decorations.push({
        from: header.from,
        to: header.to,
        deco: Decoration.replace({ widget: new CodeHeaderWidget(header.lang, header.code) }),
      });
    }
    for (const hr of plan.hrs) {
      decorations.push({ from: hr.from, to: hr.to, deco: Decoration.replace({ widget: new HrWidget() }) });
    }
    for (const bullet of plan.bullets) {
      decorations.push({
        from: bullet.from,
        to: bullet.to,
        deco: Decoration.replace({ widget: new BulletWidget() }),
      });
    }
    for (const image of plan.images) {
      decorations.push({
        from: image.from,
        to: image.to,
        deco: Decoration.replace({ widget: imageWidgetOf(image, resolveImageSrc) }),
      });
    }
    // Only the lines inside this visible range; a block straddling two ranges
    // is visited twice, hence the set.
    for (const block of plan.codeBlocks) {
      const first = state.doc.lineAt(Math.max(block.from, from)).number;
      const last = state.doc.lineAt(Math.min(block.to, to)).number;
      // The padding of a block's first and last code line is judged on the
      // whole block, not on the part inside this range; collapsed fence lines
      // are not code lines.
      const collapsed = new Set(block.collapsed ?? []);
      const isCode = (n: number) => !collapsed.has(state.doc.line(n).from);
      let firstCode = state.doc.lineAt(block.from).number;
      let lastCode = state.doc.lineAt(block.to).number;
      while (firstCode < lastCode && !isCode(firstCode)) firstCode++;
      while (lastCode > firstCode && !isCode(lastCode)) lastCode--;
      for (let n = first; n <= last; n++) {
        const t = traitsOf(state.doc.line(n).from);
        if (isCode(n)) {
          t.code = true;
          if (block.plain) t.plain = true;
          if (n === firstCode) t.codeFirst = true;
          if (n === lastCode) t.codeLast = true;
        } else {
          t.fence = true;
        }
      }
    }
    for (const { from: start, depth } of plan.listLines) {
      const t = traitsOf(start);
      t.list = Math.max(depth, t.list ?? 0);
    }
    for (const { from: start, depth, indent } of plan.quoteLines) {
      const t = traitsOf(start);
      t.quote = Math.max(depth, t.quote ?? 0);
      t.quoteIndent = Math.min(indent, t.quoteIndent ?? indent);
    }
    for (const { from: start, level } of plan.headingLines) traitsOf(start).heading = level;
    // plan.tables is rendered by tableField: block widgets cannot come from a plugin.
  }
  for (const [pos, traits] of lineTraits) decorations.push({ from: pos, to: pos, deco: lineDecoration(traits) });

  decorations.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = decorations.map((d) => d.deco.range(d.from, d.to));
  return Decoration.set(builder, true);
}

function buildJoinDecorations(state: EditorState): DecorationSet {
  const joins = planParagraphJoins({
    tree: syntaxTree(state),
    doc: state.doc,
    activeLines: activeLinesOf(state),
    frontmatterEnd: frontmatterEndOf(state),
  });
  const widget = new SoftBreakWidget();
  return Decoration.set(joins.map((j) => Decoration.replace({ widget }).range(j.from, j.to)));
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

// Replacing a line break is also state-field only, like the block table widgets.
const joinField = StateField.define<DecorationSet>({
  create: buildJoinDecorations,
  update(value, tr) {
    if (tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state)) {
      return buildJoinDecorations(tr.state);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function createInlinePlugin(resolveImageSrc: (src: string) => string): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, resolveImageSrc);
      }

      update(update: ViewUpdate): void {
        // The syntax-tree check catches the background parse that finishes a
        // long document after open, which changes neither doc, selection, nor
        // viewport.
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged ||
          syntaxTree(update.startState) !== syntaxTree(update.state) ||
          update.startState.facet(wikiLinkHost) !== update.state.facet(wikiLinkHost)
        ) {
          this.decorations = buildDecorations(update.view, resolveImageSrc);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

// The pointing hand over a link appears only while the modifier that opens it
// (Cmd on macOS, Ctrl elsewhere, as in handleLinkMousedown) is held, and says so
// through a class on the editor. Keys are read on the window because the
// modifier is often pressed with the pointer already over the link; the pointer
// itself resyncs it on the way in, and losing focus releases it.
const modifierCursor = ViewPlugin.fromClass(
  class {
    constructor(private readonly view: EditorView) {
      window.addEventListener("keydown", this.sync);
      window.addEventListener("keyup", this.sync);
      window.addEventListener("blur", this.release);
      view.dom.addEventListener("mousemove", this.sync);
    }

    private readonly sync = (e: KeyboardEvent | MouseEvent): void => {
      this.view.dom.classList.toggle("cm-lp-mod", IS_MAC ? e.metaKey : e.ctrlKey);
    };

    private readonly release = (): void => {
      this.view.dom.classList.remove("cm-lp-mod");
    };

    destroy(): void {
      window.removeEventListener("keydown", this.sync);
      window.removeEventListener("keyup", this.sync);
      window.removeEventListener("blur", this.release);
      this.view.dom.removeEventListener("mousemove", this.sync);
      this.release();
    }
  },
);

export function livePreviewPlugin(resolveImageSrc: (src: string) => string): Extension {
  return [createInlinePlugin(resolveImageSrc), modifierCursor, tableField, joinField];
}

// Where the link under `pos` points: an inline or reference link, an
// `<autolink>` or a bare URL. Null when there is no link, or it is not external.
export function linkUrlAt(state: EditorState, pos: number): string | null {
  const external = (url: string | undefined): string | null => (url && isExternalUrl(url) ? url : null);
  const text = (node: SyntaxNode): string => state.doc.sliceString(node.from, node.to);
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    const name = node.type.name;
    if (name === "Link") {
      const urlNode = node.getChild("URL");
      return external(
        urlNode
          ? text(urlNode)
          : resolveReference(
              node,
              state.doc,
              linkDefinitions(syntaxTree(state), state.doc, frontmatterEndOf(state)),
            )?.url,
      );
    }
    if (name === "Autolink") {
      const urlNode = node.getChild("URL");
      return urlNode ? external(autolinkHref(text(urlNode))) : null;
    }
    if (name === "URL" && !NOT_BARE_URL_PARENTS.has(node.parent?.type.name ?? "")) {
      return external(autolinkHref(text(node)));
    }
  }
  return null;
}

// Cmd/Ctrl+click opens a link; a plain click only places the cursor, so the
// link stays editable (Obsidian's live preview behaves the same way). Only the
// primary button counts, so a right-click keeps its context menu. The
// modifier itself is platform-gated, matching CodeMirror's own mod-click
// convention: on macOS a Ctrl+click is the system's context-menu gesture
// (WebKit reports it as an ordinary button-0 mousedown with ctrlKey set), so
// only metaKey may open a link there; everywhere else only ctrlKey does.
export function handleLinkMousedown(event: MouseEvent, view: EditorView): boolean {
  if (event.button !== 0) return false;
  const modifierHeld = IS_MAC ? event.metaKey : event.ctrlKey;
  if (!modifierHeld && !view.state.facet(staticPreview)) return false;
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos == null) return false;
  const wiki = wikiTargetAt(view.state, pos);
  if (wiki !== null) {
    const host = view.state.facet(wikiLinkHost);
    if (!host) return false;
    event.preventDefault();
    host.open(wiki);
    return true;
  }
  const url = linkUrlAt(view.state, pos);
  if (!url) return false;
  event.preventDefault();
  openExternalUrl(url);
  return true;
}

// What the editor needs to know about the workspace's notes: whether a name
// points at one (to tell a live link from a dangling one) and how to open it.
export type WikiLinkHost = { resolve(target: string): string | null; open(target: string): void };
export const wikiLinkHost = Facet.define<WikiLinkHost, WikiLinkHost | null>({
  combine: (values) => values[0] ?? null,
});

function wikiLinkClass(state: EditorState, target: string | undefined): string {
  const host = state.facet(wikiLinkHost);
  // A view with no notes to open (an overlay preview) shows the label as plain text.
  if (!host || target === undefined) return "cm-lp-notlink";
  return host.resolve(target) === null ? "cm-lp-wikilink-missing" : "cm-lp-link-text";
}

// The note name of the `[[...]]` under `pos`; null when there is none or it
// sits inside code.
export function wikiTargetAt(state: EditorState, pos: number): string | null {
  const line = state.doc.lineAt(pos);
  for (let i = line.text.indexOf("[["); i !== -1; i = line.text.indexOf("[[", i + 1)) {
    const wiki = wikiLinkAt(line.text, i);
    if (!wiki || pos < line.from + wiki.from || pos > line.from + wiki.to) continue;
    for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) {
      if (n.type.name === "InlineCode" || n.type.name === "FencedCode" || n.type.name === "CodeBlock") return null;
    }
    return wiki.target;
  }
  return null;
}

export const linkClickHandler: Extension =EditorView.domEventHandlers({ mousedown: handleLinkMousedown });
