import { markdownLanguage } from "@codemirror/lang-markdown";
import type { SyntaxNode } from "@lezer/common";
import { autolinkHref } from "@/modules/markdown/codemirror/lib/externalUrl";

export type CellNode =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "br" }
  | { type: "link"; url: string; children: CellNode[] }
  | { type: "strong" | "em" | "del" | "sub" | "sup"; children: CellNode[] };

// The inline markdown of one table cell, read with the same parser as the
// document so a cell means exactly what it would outside a table. Reference
// links and images are not resolved here: they stay as typed.
export function parseCellInline(raw: string): CellNode[] {
  if (raw === "") return [];
  const tree = markdownLanguage.parser.parse(raw);
  return range(tree.topNode, 0, raw.length, raw);
}

// Everything a node holds between `from` and `to`: its children converted, and
// the gaps between them as text.
function range(parent: SyntaxNode, from: number, to: number, raw: string): CellNode[] {
  const out: CellNode[] = [];
  let pos = from;
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.to <= from) continue;
    if (child.from >= to) break;
    if (child.from > pos) pushText(out, raw.slice(pos, child.from));
    for (const node of convert(child, raw)) pushNode(out, node);
    pos = child.to;
  }
  if (pos < to) pushText(out, raw.slice(pos, to));
  return out;
}

const WRAPPERS: Record<string, { type: "strong" | "em" | "del" | "sub" | "sup"; mark: string }> = {
  StrongEmphasis: { type: "strong", mark: "EmphasisMark" },
  Emphasis: { type: "em", mark: "EmphasisMark" },
  Strikethrough: { type: "del", mark: "StrikethroughMark" },
  Subscript: { type: "sub", mark: "SubscriptMark" },
  Superscript: { type: "sup", mark: "SuperscriptMark" },
};

function convert(node: SyntaxNode, raw: string): CellNode[] {
  const name = node.type.name;
  const literal = (): CellNode[] => [{ type: "text", value: raw.slice(node.from, node.to) }];

  if (name === "Paragraph") return range(node, node.from, node.to, raw);

  const wrapper = WRAPPERS[name];
  if (wrapper) {
    const marks = node.getChildren(wrapper.mark);
    if (marks.length < 2) return literal();
    return [{ type: wrapper.type, children: range(node, marks[0].to, marks[marks.length - 1].from, raw) }];
  }

  if (name === "InlineCode") {
    const marks = node.getChildren("CodeMark");
    if (marks.length < 2) return literal();
    return [{ type: "code", value: raw.slice(marks[0].to, marks[marks.length - 1].from) }];
  }

  if (name === "Link") {
    const [open, close] = node.getChildren("LinkMark");
    const url = node.getChild("URL");
    if (!open || !close || !url) return literal();
    return [{ type: "link", url: destination(raw.slice(url.from, url.to)), children: range(node, open.to, close.from, raw) }];
  }

  if (name === "Autolink") {
    const url = node.getChild("URL");
    if (!url) return literal();
    const text = raw.slice(url.from, url.to);
    return [{ type: "link", url: autolinkHref(text), children: [{ type: "text", value: text }] }];
  }

  if (name === "URL") {
    const text = raw.slice(node.from, node.to);
    return [{ type: "link", url: autolinkHref(text), children: [{ type: "text", value: text }] }];
  }

  if (name === "Escape") return [{ type: "text", value: raw.slice(node.from + 1, node.to) }];

  if (name === "HTMLTag" && /^<br\s*\/?>$/i.test(raw.slice(node.from, node.to))) return [{ type: "br" }];

  return literal();
}

// A destination may be wrapped in angle brackets (`<url>`).
function destination(text: string): string {
  const trimmed = text.trim();
  return trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed.slice(1, -1) : trimmed;
}

function pushText(out: CellNode[], value: string): void {
  pushNode(out, { type: "text", value });
}

function pushNode(out: CellNode[], node: CellNode): void {
  const last = out[out.length - 1];
  if (node.type === "text" && last?.type === "text") last.value += node.value;
  else out.push(node);
}
