import type { SyntaxNode, Tree } from "@lezer/common";
import type { Text } from "@codemirror/state";

export type MarkSpec = { from: number; to: number; className: string };
export type HideSpec = { from: number; to: number };
export type CheckboxSpec = { from: number; to: number; checked: boolean };
export type TableAlign = "left" | "center" | "right" | null;
export type TableSpec = {
  from: number;
  to: number;
  headers: string[];
  aligns: TableAlign[];
  rows: string[][];
};
export type CodeBlockSpec = { from: number; to: number };
export type LivePreviewPlan = {
  marks: MarkSpec[];
  hides: HideSpec[];
  checkboxes: CheckboxSpec[];
  tables: TableSpec[];
  codeBlocks: CodeBlockSpec[];
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
        const table = renderedTable(node, doc, activeLines);
        if (table) {
          tables.push(table);
          return false;
        }
        return;
      }

      // A range, not a mark: a mark splits per line and skips blank lines, so
      // the plugin styles each of its lines instead.
      if (node.type.name === "FencedCode") {
        codeBlocks.push({ from: node.from, to: node.to });
        return false;
      }

      if (HEADING_NAMES.has(node.type.name)) {
        const level = node.type.name.slice(-1);
        marks.push({ from: node.from, to: node.to, className: `cm-lp-heading cm-lp-h${level}` });
        const mark = node.getChild("HeaderMark");
        if (mark && !isActive(node, doc, activeLines)) {
          hides.push({ from: mark.from, to: mark.to });
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
        planLink(node, doc, activeLines, marks, hides);
        return;
      }

      if (node.type.name === "ListMark") {
        marks.push({ from: node.from, to: node.to, className: "cm-lp-bullet" });
        return;
      }

      if (node.type.name === "Task") {
        const marker = node.getChild("TaskMarker");
        if (marker) {
          const text = doc.sliceString(marker.from, marker.to);
          checkboxes.push({ from: marker.from, to: marker.to, checked: text === "[x]" || text === "[X]" });
        }
      }
    },
  });

  return { marks, hides, checkboxes, tables, codeBlocks };
}

export type TablePlanInput = {
  tree: Tree;
  doc: Text;
  activeLines: ReadonlySet<number>;
  frontmatterEnd: number;
};

// Tables across the whole document, for the block-widget state field (block
// decorations cannot come from the viewport-bound plugin). Only top-level
// blocks are visited: a table nested in a list or quote never starts at a line
// start, so renderedTable would reject it anyway.
export function planTables(input: TablePlanInput): TableSpec[] {
  const { tree, doc, activeLines, frontmatterEnd } = input;
  const tables: TableSpec[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.type.name !== "Table" || node.from < frontmatterEnd) continue;
    const table = renderedTable(node, doc, activeLines);
    if (table) tables.push(table);
  }
  return tables;
}

// A block widget must replace whole lines, so a table indented inside a list
// item or prefixed by a quote marker stays raw source.
function renderedTable(node: SyntaxNode, doc: Text, activeLines: ReadonlySet<number>): TableSpec | null {
  if (isActive(node, doc, activeLines)) return null;
  if (doc.lineAt(node.from).from !== node.from || doc.lineAt(node.to).to !== node.to) return null;
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
  return { from: node.from, to: node.to, headers, aligns, rows };
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
): void {
  const active = isActive(node, doc, activeLines);
  const chrome: SyntaxNode[] = [];
  let child = node.firstChild;
  while (child) {
    if (child.type.name === "LinkMark" || child.type.name === "URL" || child.type.name === "LinkTitle") {
      chrome.push(child);
    }
    child = child.nextSibling;
  }
  // Lezer emits a Link node for any bracketed text, destination or not
  // (`[TODO]`, Kex's own `[[Wiki Link]]`); without a URL it is not a link.
  if (!chrome.some((c) => c.type.name === "URL")) return;
  if (!active) {
    for (const c of chrome) hides.push({ from: c.from, to: c.to });
  }
  const openBracket = chrome.find((c) => c.type.name === "LinkMark");
  if (!openBracket) return;
  const closeBracket = chrome.find(
    (c) => c.type.name === "LinkMark" && c.from > openBracket.to,
  );
  const textFrom = openBracket.to;
  const textTo = closeBracket ? closeBracket.from : node.to;
  if (textTo > textFrom) {
    marks.push({ from: textFrom, to: textTo, className: "cm-lp-link-text" });
  }
}
