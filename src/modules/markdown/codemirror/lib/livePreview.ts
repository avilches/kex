import type { SyntaxNode, Tree } from "@lezer/common";
import type { Text } from "@codemirror/state";
import { codeLanguages } from "@/modules/markdown/codemirror/lib/codeLanguages";

export type MarkSpec = { from: number; to: number; className: string; title?: string };
export type HideSpec = { from: number; to: number };
// `from`/`to` are the "[ ]" marker (what a click rewrites); `replaceFrom` is where
// the widget starts, earlier than `from` when it also swallows the "-" of a task
// item so the checkbox sits exactly where the bullet of a plain item would.
export type CheckboxSpec = { from: number; to: number; checked: boolean; replaceFrom: number };
export type TableAlign = "left" | "center" | "right" | null;
export type TableSpec = {
  from: number;
  to: number;
  // How many list items the table sits inside (0 at the top level).
  listDepth: number;
  headers: string[];
  aligns: TableAlign[];
  rows: string[][];
};
// `collapsed` lists the line starts of a rendered block's fence lines, which
// take no height at all (the header floats over the first code line instead).
// `plain` marks code no language highlights (indented, untagged or an unknown
// tag): some themes italicize its text, which a highlighted block must keep for
// its comments.
export type CodeBlockSpec = { from: number; to: number; collapsed?: number[]; plain?: boolean };
export type HrSpec = { from: number; to: number };
export type BulletSpec = { from: number; to: number };
export type ImageSpec = { from: number; to: number; alt: string; url: string; title?: string };
export type LinkDefinition = { url: string; title: string | null };
export type LineDepthSpec = { from: number; depth: number };
// `indent`: how many list items the quote sits inside (0 unless it is in a
// list), which shifts its bar and text to the item's text.
export type QuoteLineSpec = LineDepthSpec & { indent: number };
export type HeadingLineSpec = { from: number; level: number };
// `from`/`to` cover the opening fence and its language tag; `code` is what the
// copy button puts on the clipboard.
export type CodeHeaderSpec = { from: number; to: number; lang: string; code: string };
export type LivePreviewPlan = {
  marks: MarkSpec[];
  hides: HideSpec[];
  checkboxes: CheckboxSpec[];
  tables: TableSpec[];
  codeBlocks: CodeBlockSpec[];
  hrs: HrSpec[];
  bullets: BulletSpec[];
  images: ImageSpec[];
  // Line-start positions, each with its nesting depth (a bar per quote level,
  // an indent step per list level below the first) or heading level.
  quoteLines: QuoteLineSpec[];
  listLines: LineDepthSpec[];
  headingLines: HeadingLineSpec[];
  codeHeaders: CodeHeaderSpec[];
};

export type LivePreviewInput = {
  tree: Tree;
  doc: Text;
  from: number;
  to: number;
  activeLines: ReadonlySet<number>;
  frontmatterEnd: number;
};

const HEADING_NAMES = new Set([
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
]);

// A URL node under one of these is a destination, not a link of its own.
export const NOT_BARE_URL_PARENTS: ReadonlySet<string> = new Set(["Link", "Image", "LinkReference", "Autolink"]);

function isActive(node: SyntaxNode, doc: Text, activeLines: ReadonlySet<number>): boolean {
  const startLine = doc.lineAt(node.from).number;
  const endLine = doc.lineAt(node.to).number;
  for (let line = startLine; line <= endLine; line++) {
    if (activeLines.has(line)) return true;
  }
  return false;
}

export function planLivePreview(input: LivePreviewInput): LivePreviewPlan {
  const { tree, doc, from, to, activeLines, frontmatterEnd } = input;
  const marks: MarkSpec[] = [];
  const hides: HideSpec[] = [];
  const checkboxes: CheckboxSpec[] = [];
  const tables: TableSpec[] = [];
  const codeBlocks: CodeBlockSpec[] = [];
  const hrs: HrSpec[] = [];
  const bullets: BulletSpec[] = [];
  const images: ImageSpec[] = [];
  const quoteDepth = new Map<number, number>();
  const quoteIndent = new Map<number, number>();
  const listDepth = new Map<number, number>();
  const headingLines: HeadingLineSpec[] = [];
  const codeHeaders: CodeHeaderSpec[] = [];
  const definitions = linkDefinitions(tree, doc, frontmatterEnd);

  // Frontmatter is never parsed as markdown (see the frontmatterEnd check inside
  // enter() below, which skips it entirely); it still needs its own monospace
  // styling, which nothing else in this function would otherwise apply.
  if (frontmatterEnd > from) {
    marks.push({ from: Math.max(from, 0), to: Math.min(to, frontmatterEnd), className: "cm-lp-frontmatter" });
  }

  tree.iterate({
    from,
    to,
    enter(ref) {
      if (ref.from < frontmatterEnd) return;
      // Lezer's tree.iterate({ from, to }) still visits a node that merely
      // touches the `to` boundary (node.from === to), so an explicit overlap
      // check is needed to honor the caller's exclusive viewport bound.
      if (ref.from >= to || ref.to <= from) return;
      const node = ref.node;

      if (node.type.name === "HTMLBlock" || node.type.name === "HTMLTag") {
        marks.push({ from: node.from, to: node.to, className: "cm-lp-html" });
        return;
      }

      if (node.type.name === "Table") {
        // An inactive table renders as a widget, so nothing inside it is
        // decorated on its own; an active one falls through to the raw source.
        const table = renderedTable(node, doc, activeLines, listDepthOf(node));
        if (table) {
          tables.push(table);
          return false;
        }
        return;
      }

      // A range, not a mark: a mark splits per line and skips blank lines, so
      // the plugin styles each of its lines instead.
      if (node.type.name === "FencedCode") {
        const block: CodeBlockSpec = { from: node.from, to: node.to };
        codeBlocks.push(block);
        const info = node.getChild("CodeInfo");
        const tag = info ? doc.sliceString(info.from, info.to).trim().split(/\s+/)[0] : "";
        if (!tag || !codeLanguages(tag)) block.plain = true;
        if (!isActive(node, doc, activeLines)) {
          const fences = node.getChildren("CodeMark");
          const opening = fences[0];
          const closing = fences.length > 1 ? fences[fences.length - 1] : null;
          // Neither fence line takes any space: the opening one carries the
          // block's header (language tag and copy button), floated over the
          // first code line, and the closing one just hides.
          // An empty block keeps its lines, or it would vanish altogether.
          const openLineNo = opening ? doc.lineAt(opening.from).number : 0;
          const closeLineNo = closing ? doc.lineAt(closing.from).number : doc.lineAt(node.to).number + 1;
          if (opening && closeLineNo - openLineNo > 1) {
            block.collapsed = [
              doc.lineAt(opening.from).from,
              ...(closing ? [doc.lineAt(closing.from).from] : []),
            ];
          }
          if (opening) {
            const openLine = doc.lineAt(opening.from);
            const bodyEnd = closing ? doc.lineAt(closing.from).from - 1 : node.to;
            codeHeaders.push({
              from: opening.from,
              to: info ? info.to : opening.to,
              lang: info ? doc.sliceString(info.from, info.to).trim() : "",
              code: openLine.to + 1 <= bodyEnd ? doc.sliceString(openLine.to + 1, bodyEnd) : "",
            });
          }
          if (closing) hides.push({ from: closing.from, to: closing.to });
          // A quoted block carries a marker on each of its lines, as children
          // of the block itself (which this case does not descend into).
          for (const mark of node.getChildren("QuoteMark")) hides.push(quoteMarkHide(mark, doc));
          hideContainerIndent(node, doc, hides);
        }
        return false;
      }

      // Text indented by four spaces is code too: same block styling. Off the
      // active block its indentation is hidden, so it sits exactly where a
      // fenced block's code does.
      if (node.type.name === "CodeBlock") {
        codeBlocks.push({ from: node.from, to: node.to, plain: true });
        if (!isActive(node, doc, activeLines)) hideContainerIndent(node, doc, hides);
        return false;
      }

      if (node.type.name === "HorizontalRule") {
        if (!isActive(node, doc, activeLines)) {
          hrs.push({ from: node.from, to: node.to });
        }
        return;
      }

      if (node.type.name === "Blockquote") {
        marks.push({ from: node.from, to: node.to, className: "cm-lp-quote" });
        // A nested quote is visited inside its parent, so depth accumulates.
        for (const start of lineStartsIn(node, doc, from, to)) {
          quoteDepth.set(start, (quoteDepth.get(start) ?? 0) + 1);
          // The outermost quote of the line decides how far it is indented.
          const outerLists = listDepthOf(node);
          quoteIndent.set(start, Math.min(quoteIndent.get(start) ?? outerLists, outerLists));
        }
        return;
      }

      if (node.type.name === "ListItem") {
        // Same accumulation as quotes: a nested item is visited inside its parent.
        for (const start of lineStartsIn(node, doc, from, to)) {
          listDepth.set(start, (listDepth.get(start) ?? 0) + 1);
        }
        return;
      }

      // Nested wherever the block parser placed the continuation line (not
      // necessarily a direct child of Blockquote), so it is handled on its
      // own rather than through hideMatchingChildren from the Blockquote case.
      if (node.type.name === "QuoteMark") {
        // The marker of a quoted fence's opening line lies outside the block
        // but goes with it: raw while the block is being edited.
        const block = node.nextSibling;
        const beforeActiveFence =
          block?.type.name === "FencedCode" &&
          doc.lineAt(block.from).number === doc.lineAt(node.from).number &&
          isActive(block, doc, activeLines);
        if (!beforeActiveFence && !isActive(node, doc, activeLines)) hides.push(quoteMarkHide(node, doc));
        return;
      }

      if (node.type.name === "Image") {
        planImage(node, doc, activeLines, images, definitions);
        return false;
      }

      // A `[id]: url "title"` definition only feeds the links that use it, so
      // it disappears (the line stays, empty) until the cursor comes to edit it.
      if (node.type.name === "LinkReference") {
        if (!isActive(node, doc, activeLines)) hides.push({ from: node.from, to: node.to });
        return false;
      }

      if (HEADING_NAMES.has(node.type.name)) {
        const level = node.type.name.slice(-1);
        headingLines.push({ from: doc.lineAt(node.from).from, level: Number(level) });
        marks.push({ from: node.from, to: node.to, className: `cm-lp-heading cm-lp-h${level}` });
        const mark = node.getChild("HeaderMark");
        if (mark && !isActive(node, doc, activeLines)) {
          // The space after the "#" goes too, or the title sits a space to the
          // right of the paragraphs around it.
          const line = doc.lineAt(mark.to);
          let end = mark.to;
          while (end < line.to && /[ \t]/.test(doc.sliceString(end, end + 1))) end++;
          hides.push({ from: mark.from, to: end });
        }
        return;
      }

      if (node.type.name === "StrongEmphasis" || node.type.name === "Emphasis") {
        const className = node.type.name === "StrongEmphasis" ? "cm-lp-bold" : "cm-lp-italic";
        marks.push({ from: node.from, to: node.to, className });
        if (!isActive(node, doc, activeLines)) {
          hideMatchingChildren(node, "EmphasisMark", hides);
        }
        return;
      }

      if (node.type.name === "Subscript" || node.type.name === "Superscript") {
        const sub = node.type.name === "Subscript";
        marks.push({ from: node.from, to: node.to, className: sub ? "cm-lp-sub" : "cm-lp-sup" });
        if (!isActive(node, doc, activeLines)) {
          hideMatchingChildren(node, sub ? "SubscriptMark" : "SuperscriptMark", hides);
        }
        return;
      }

      if (node.type.name === "Strikethrough") {
        marks.push({ from: node.from, to: node.to, className: "cm-lp-strike" });
        if (!isActive(node, doc, activeLines)) {
          hideMatchingChildren(node, "StrikethroughMark", hides);
        }
        return;
      }

      if (node.type.name === "InlineCode") {
        marks.push({ from: node.from, to: node.to, className: "cm-lp-code" });
        if (!isActive(node, doc, activeLines)) {
          hideMatchingChildren(node, "CodeMark", hides);
        }
        return;
      }

      if (node.type.name === "Link") {
        planLink(node, doc, activeLines, marks, hides, definitions);
        return;
      }

      // `<https://x.com>`: the address is the link text, the angle brackets go.
      if (node.type.name === "Autolink") {
        const url = node.getChild("URL");
        if (url) {
          marks.push({ from: url.from, to: url.to, className: "cm-lp-link-text" });
          if (!isActive(node, doc, activeLines)) {
            for (const mark of node.getChildren("LinkMark")) hides.push({ from: mark.from, to: mark.to });
          }
        }
        return false;
      }

      // A bare `https://x.com`, `www.x.com` or address: a URL node that is not
      // the destination of a link, an image or a reference definition.
      if (node.type.name === "URL" && !NOT_BARE_URL_PARENTS.has(node.parent?.type.name ?? "")) {
        marks.push({ from: node.from, to: node.to, className: "cm-lp-link-text" });
        return;
      }

      if (node.type.name === "ListMark") {
        marks.push({ from: node.from, to: node.to, className: "cm-lp-bullet" });
        // ListMark also covers an ordered item's "1." marker; only an
        // unordered item's marker (-, * or +) becomes a real bullet glyph.
        const isBulletList = node.parent?.parent?.type.name === "BulletList";
        // A task item gets its checkbox in place of the bullet (see the Task case).
        const isTask = node.parent?.getChild("Task") != null;
        if (isBulletList && !isTask && !isActive(node, doc, activeLines)) {
          bullets.push({ from: node.from, to: node.to });
        }
        return;
      }

      if (node.type.name === "Task") {
        const marker = node.getChild("TaskMarker");
        // On its own active line a task is plain text ("- [ ] item"), so the
        // brackets can be edited; the checkbox comes back when the cursor leaves.
        if (marker && !isActive(marker, doc, activeLines)) {
          const text = doc.sliceString(marker.from, marker.to);
          const listMark = node.parent?.getChild("ListMark");
          const inBulletList = node.parent?.parent?.type.name === "BulletList";
          const replaceFrom = listMark && inBulletList ? listMark.from : marker.from;
          checkboxes.push({
            from: marker.from,
            to: marker.to,
            checked: text === "[x]" || text === "[X]",
            replaceFrom,
          });
        }
      }
    },
  });

  return {
    marks,
    hides,
    checkboxes,
    tables,
    codeBlocks,
    hrs,
    bullets,
    images,
    quoteLines: [...quoteDepth].map(([lineFrom, depth]) => ({
      from: lineFrom,
      depth,
      indent: quoteIndent.get(lineFrom) ?? 0,
    })),
    listLines: [...listDepth].map(([lineFrom, depth]) => ({ from: lineFrom, depth })),
    headingLines,
    codeHeaders,
  };
}

function lineStartsIn(node: SyntaxNode, doc: Text, from: number, to: number): number[] {
  const first = doc.lineAt(Math.max(node.from, from)).number;
  const last = doc.lineAt(Math.max(Math.min(node.to, to) - 1, Math.max(node.from, from))).number;
  const starts: number[] = [];
  for (let n = first; n <= last; n++) starts.push(doc.line(n).from);
  return starts;
}

function listDepthOf(node: SyntaxNode): number {
  let depth = 0;
  for (let p = node.parent; p; p = p.parent) if (p.type.name === "ListItem") depth++;
  return depth;
}

// The parser strips the indentation a code line gets from its container (four
// spaces of an indented block, the indent of a list item): each CodeText starts
// after it. Hiding that leading whitespace puts every code line at the same
// place whatever it is nested in; the padding comes from the line's own styling.
function hideContainerIndent(block: SyntaxNode, doc: Text, hides: HideSpec[]): void {
  for (const text of block.getChildren("CodeText")) {
    const lineStart = doc.lineAt(text.from).from;
    if (lineStart < text.from && doc.sliceString(lineStart, text.from).trim() === "") {
      hides.push({ from: lineStart, to: text.from });
    }
  }
}

// Quote markers are hidden together with the whitespace around them, so
// "> > text" reads the same however many spaces separate the markers.
function quoteMarkHide(mark: SyntaxNode, doc: Text): HideSpec {
  const line = doc.lineAt(mark.from);
  const leading = doc.sliceString(line.from, mark.from).trim() === "";
  let end = mark.to;
  while (end < line.to && /[ \t]/.test(doc.sliceString(end, end + 1))) end++;
  return { from: leading ? line.from : mark.from, to: end };
}

export type TablePlanInput = {
  tree: Tree;
  doc: Text;
  activeLines: ReadonlySet<number>;
  frontmatterEnd: number;
};

export type JoinPlanInput = TablePlanInput;

// The source line breaks inside a paragraph, as CommonMark reads them: a plain
// one is a space, so the lines flow as one text; only a blank line, two
// trailing spaces or a trailing backslash actually break it. Each range runs
// from the end of one line's text to the start of the next line's text, so the
// quote markers and list indentation of the continuation line fall inside it.
// It replaces a line break, which CodeMirror only accepts from a state field.
export function planParagraphJoins(input: JoinPlanInput): HideSpec[] {
  const { tree, doc, activeLines, frontmatterEnd } = input;
  const joins: HideSpec[] = [];
  tree.iterate({
    enter(ref) {
      if (ref.from < frontmatterEnd) return;
      const name = ref.type.name;
      if (name === "Paragraph") {
        planParagraphJoin(ref.node, doc, activeLines, joins);
        return false;
      }
      if (name === "FencedCode" || name === "CodeBlock" || name === "Table" || name === "HTMLBlock") return false;
    },
  });
  return joins;
}

function planParagraphJoin(
  paragraph: SyntaxNode,
  doc: Text,
  activeLines: ReadonlySet<number>,
  joins: HideSpec[],
): void {
  const first = doc.lineAt(paragraph.from).number;
  const last = doc.lineAt(paragraph.to).number;
  if (first === last || isActive(paragraph, doc, activeLines)) return;
  for (let n = first; n < last; n++) {
    const line = doc.line(n);
    if (endsWithHardBreak(line.text)) continue;
    const next = doc.line(n + 1);
    joins.push({ from: line.from + line.text.trimEnd().length, to: next.from + continuationPrefixLength(next.text) });
  }
}

function endsWithHardBreak(text: string): boolean {
  if (/ {2,}$/.test(text)) return true;
  const backslashes = /\\+$/.exec(text)?.[0].length ?? 0;
  return backslashes % 2 === 1;
}

// Indentation and quote markers ("> > ") ahead of a continuation line's text.
function continuationPrefixLength(text: string): number {
  let i = 0;
  while (i < text.length && (text[i] === " " || text[i] === "\t" || text[i] === ">")) i++;
  return i;
}

// Tables across the whole document, for the block-widget state field (block
// decorations cannot come from the viewport-bound plugin). Only block
// containers are walked, never inline content, and only lists (a quote's `>`
// prefix is not something a block widget can replace).
export function planTables(input: TablePlanInput): TableSpec[] {
  const { tree, doc, activeLines, frontmatterEnd } = input;
  const tables: TableSpec[] = [];
  const visit = (parent: SyntaxNode, listDepth: number): void => {
    for (let node = parent.firstChild; node; node = node.nextSibling) {
      if (node.from < frontmatterEnd) continue;
      const name = node.type.name;
      if (name === "Table") {
        const table = renderedTable(node, doc, activeLines, listDepth);
        if (table) tables.push(table);
      } else if (name === "BulletList" || name === "OrderedList") {
        visit(node, listDepth);
      } else if (name === "ListItem") {
        visit(node, listDepth + 1);
      }
    }
  };
  visit(tree.topNode, 0);
  return tables;
}

// A block widget must replace whole lines: a table indented inside a list item
// is replaced from the start of its first line (the indentation goes with it,
// the widget re-creates it), but one with anything else ahead of it, such as a
// quote marker, stays raw source.
function renderedTable(
  node: SyntaxNode,
  doc: Text,
  activeLines: ReadonlySet<number>,
  listDepth = 0,
): TableSpec | null {
  if (isActive(node, doc, activeLines)) return null;
  const firstLine = doc.lineAt(node.from);
  if (doc.sliceString(firstLine.from, node.from).trim() !== "" || doc.lineAt(node.to).to !== node.to) return null;
  const header = node.getChild("TableHeader");
  if (!header) return null;
  const headers = rowCells(header, doc);
  const columns = headers.length;
  const delimiter = node.getChild("TableDelimiter");
  const aligns = fitRow(
    delimiter ? splitDelimiterRow(doc.sliceString(delimiter.from, delimiter.to)).map(parseAlign) : [],
    columns,
    null,
  );
  const rows = node.getChildren("TableRow").map((row) => fitRow(rowCells(row, doc), columns, ""));
  return { from: firstLine.from, to: node.to, listDepth, headers, aligns, rows };
}

// Cells are the gaps between a row's TableDelimiter pipes, not its TableCell
// children: an empty cell ("|  |") has no TableCell node at all, so reading
// only TableCell children would shift every later cell one column left.
function rowCells(row: SyntaxNode, doc: Text): string[] {
  const pipes = row.getChildren("TableDelimiter");
  const ranges: { from: number; to: number }[] = [];
  let start = row.from;
  for (const pipe of pipes) {
    ranges.push({ from: start, to: pipe.from });
    start = pipe.to;
  }
  ranges.push({ from: start, to: row.to });
  if (pipes.length > 0 && pipes[0].from === row.from) ranges.shift();
  if (pipes.length > 0 && pipes[pipes.length - 1].to === row.to) ranges.pop();
  return ranges.map((r) => doc.sliceString(r.from, r.to).trim().replace(/\\\|/g, "|"));
}

function splitDelimiterRow(text: string): string[] {
  const cells = text.trim().split("|").map((c) => c.trim());
  if (cells[0] === "") cells.shift();
  if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

function parseAlign(cell: string): TableAlign {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (left) return "left";
  if (right) return "right";
  return null;
}

// GFM: the header row fixes the column count; body rows are padded or truncated.
function fitRow<T>(cells: T[], columns: number, fill: T): T[] {
  const out = cells.slice(0, columns);
  while (out.length < columns) out.push(fill);
  return out;
}

function hideMatchingChildren(node: SyntaxNode, childName: string, hides: HideSpec[]): void {
  let child = node.firstChild;
  while (child) {
    if (child.type.name === childName) hides.push({ from: child.from, to: child.to });
    child = child.nextSibling;
  }
}

// A plain, unformatted link's visible text ("the docs" in `[the docs](url)`) is
// never its own child node in the Lezer markdown tree: only the delimiters
// (LinkMark "[" "]" "(" ")" and URL) are nodes. The link text is therefore
// computed as the gap between the opening "[" and the next "]", not by
// looking for a "non-chrome" child, which would find nothing for plain text.
function planLink(
  node: SyntaxNode,
  doc: Text,
  activeLines: ReadonlySet<number>,
  marks: MarkSpec[],
  hides: HideSpec[],
  definitions: ReadonlyMap<string, LinkDefinition>,
): void {
  const active = isActive(node, doc, activeLines);
  const chrome: SyntaxNode[] = [];
  let child = node.firstChild;
  while (child) {
    if (
      child.type.name === "LinkMark" ||
      child.type.name === "URL" ||
      child.type.name === "LinkTitle" ||
      child.type.name === "LinkLabel"
    ) {
      chrome.push(child);
    }
    child = child.nextSibling;
  }
  // Lezer emits a Link node for any bracketed text, destination or not
  // (`[TODO]`, Kex's own `[[Wiki Link]]`). It is a link only with an inline
  // URL, or when its label names a `[label]: url` definition in the document.
  const inlineUrl = chrome.some((c) => c.type.name === "URL");
  const definition = inlineUrl ? null : resolveReference(node, doc, definitions);
  if (!inlineUrl && !definition) {
    // Themes color the whole node as a link; plain brackets must stay plain text.
    marks.push({ from: node.from, to: node.to, className: "cm-lp-notlink" });
    return;
  }
  if (!active) {
    for (const c of chrome) hides.push({ from: c.from, to: c.to });
  }
  const openBracket = chrome.find((c) => c.type.name === "LinkMark");
  if (!openBracket) return;
  const closeBracket = chrome.find(
    (c) => c.type.name === "LinkMark" && c.from >= openBracket.to && c !== openBracket,
  );
  const textFrom = openBracket.to;
  const textTo = closeBracket ? closeBracket.from : node.to;
  if (textTo > textFrom) {
    const titleNode = chrome.find((c) => c.type.name === "LinkTitle");
    const title = definition ? definition.title : titleNode ? unquoteTitle(doc.sliceString(titleNode.from, titleNode.to)) : null;
    marks.push({ from: textFrom, to: textTo, className: "cm-lp-link-text", ...(title ? { title } : {}) });
  }
}

// `[text][label]`, `[text][]` and the bare `[label]` all name a definition by
// label; `[text][]` and `[label]` use their own text as it.
export function resolveReference(
  node: SyntaxNode,
  doc: Text,
  definitions: ReadonlyMap<string, LinkDefinition>,
): LinkDefinition | null {
  const [open, close] = node.getChildren("LinkMark");
  if (!open) return null;
  const text = doc.sliceString(open.to, close ? close.from : node.to);
  const labelNode = node.getChild("LinkLabel");
  const explicit = labelNode ? doc.sliceString(labelNode.from + 1, labelNode.to - 1) : "";
  return definitions.get(normalizeLinkLabel(explicit.trim() === "" ? text : explicit)) ?? null;
}

// CommonMark matches labels case-insensitively with internal whitespace collapsed.
function normalizeLinkLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function unquoteTitle(raw: string): string | null {
  const inner = raw.slice(1, -1).trim();
  return inner === "" ? null : inner;
}

const definitionCache = new WeakMap<Tree, Map<string, LinkDefinition>>();

// Every `[label]: url "title"` of the document, not just the viewport: the
// definition is usually far from the links that use it. First one wins, as in
// CommonMark. Only block containers are walked, never inline content.
export function linkDefinitions(tree: Tree, doc: Text, frontmatterEnd: number): Map<string, LinkDefinition> {
  const cached = definitionCache.get(tree);
  if (cached) return cached;
  const out = new Map<string, LinkDefinition>();
  collectDefinitions(tree.topNode, doc, frontmatterEnd, out);
  definitionCache.set(tree, out);
  return out;
}

function collectDefinitions(
  parent: SyntaxNode,
  doc: Text,
  frontmatterEnd: number,
  out: Map<string, LinkDefinition>,
): void {
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.from < frontmatterEnd) continue;
    const name = child.type.name;
    if (name === "LinkReference") {
      const label = child.getChild("LinkLabel");
      const urlNode = child.getChild("URL");
      if (!label || !urlNode) continue;
      const key = normalizeLinkLabel(doc.sliceString(label.from + 1, label.to - 1));
      if (out.has(key)) continue;
      const raw = doc.sliceString(urlNode.from, urlNode.to);
      const url = raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw;
      const titleNode = child.getChild("LinkTitle");
      out.set(key, { url, title: titleNode ? unquoteTitle(doc.sliceString(titleNode.from, titleNode.to)) : null });
    } else if (name === "Blockquote" || name === "BulletList" || name === "OrderedList" || name === "ListItem") {
      collectDefinitions(child, doc, frontmatterEnd, out);
    }
  }
}

// An Image node's opening marker is the single two-char token "![", not "["
// (LinkMark) followed by "!" text: the "!" has no node of its own.
function planImage(
  node: SyntaxNode,
  doc: Text,
  activeLines: ReadonlySet<number>,
  images: ImageSpec[],
  definitions: ReadonlyMap<string, LinkDefinition>,
): void {
  if (isActive(node, doc, activeLines)) return;
  const marks = node.getChildren("LinkMark");
  const urlNode = node.getChild("URL");
  const openBracket = marks.find((m) => m.from === node.from);
  // `>=`: with an empty alt ("![](url)") the closing "]" starts right where "![" ends.
  const closeBracket = marks.find((m) => openBracket && m !== openBracket && m.from >= openBracket.to);
  if (!openBracket) return;
  // `![alt][label]` takes its source from a definition, like a reference link.
  const definition = urlNode ? null : resolveReference(node, doc, definitions);
  if (!urlNode && !definition) return;
  const alt = doc.sliceString(openBracket.to, closeBracket ? closeBracket.from : (urlNode?.from ?? node.to));
  const titleNode = node.getChild("LinkTitle");
  const title = definition ? definition.title : titleNode ? unquoteTitle(doc.sliceString(titleNode.from, titleNode.to)) : null;
  images.push({
    from: node.from,
    to: node.to,
    alt,
    url: definition ? definition.url : doc.sliceString(urlNode?.from ?? 0, urlNode?.to ?? 0),
    ...(title ? { title } : {}),
  });
}
