import { frontmatterAsCodeBlock, splitFrontmatter } from "@/modules/markdown/lib/frontmatter";

// Where the reader was in a markdown document, in lines of the source text, so
// it survives a switch between views that do not share one CodeMirror state.
export type ViewPosition = {
  // 1-based line and 0-based column of the cursor.
  cursorLine: number;
  cursorCol: number;
  // 1-based line shown at the top of the viewport.
  topLine: number;
};

const countLines = (s: string): number => s.split("\n").length - 1;

// Preview draws the frontmatter as a fenced block, which can have a different
// number of lines than the source (an empty block gains one). Returns how many
// lines every line after the frontmatter moves by, and where it ends.
function frontmatterShift(raw: string): { endLine: number; delta: number } {
  const { frontmatter } = splitFrontmatter(raw);
  if (!frontmatter) return { endLine: 0, delta: 0 };
  const rendered = frontmatterAsCodeBlock(raw);
  const body = raw.slice(frontmatter.length);
  const renderedFront = rendered.slice(0, rendered.length - body.length);
  return { endLine: countLines(frontmatter), delta: countLines(renderedFront) - countLines(frontmatter) };
}

export function sourceToPreviewLine(raw: string, line: number): number {
  const { endLine, delta } = frontmatterShift(raw);
  return line > endLine ? line + delta : line;
}

export function previewToSourceLine(raw: string, line: number): number {
  const { endLine, delta } = frontmatterShift(raw);
  return line > endLine + delta ? line - delta : Math.min(line, Math.max(endLine, 1));
}

// Coming back from Preview, where there is no cursor: if the reader did not
// scroll there, the old cursor and scroll are exact; if they did, the cursor
// goes to the top of what they were reading.
export function positionAfterPreview(saved: ViewPosition | null, previewTopLine: number): ViewPosition {
  if (saved && saved.topLine === previewTopLine) return saved;
  return { cursorLine: previewTopLine, cursorCol: 0, topLine: previewTopLine };
}
