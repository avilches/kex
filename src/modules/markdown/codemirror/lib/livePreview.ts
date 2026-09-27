import type { SyntaxNode, Tree } from "@lezer/common";
import type { Text } from "@codemirror/state";

export type MarkSpec = { from: number; to: number; className: string };
export type HideSpec = { from: number; to: number };
export type CheckboxSpec = { from: number; to: number; checked: boolean };
export type LivePreviewPlan = { marks: MarkSpec[]; hides: HideSpec[]; checkboxes: CheckboxSpec[] };

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

      if (node.type.name === "FencedCode") {
        marks.push({ from: node.from, to: node.to, className: "cm-lp-codeblock" });
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

  return { marks, hides, checkboxes };
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
