// YAML frontmatter is never parsed or mutated: the editor treats it as an
// opaque prefix, preserved byte-exact and re-prepended on save.
export type FrontmatterSplit = { frontmatter: string; body: string };

const OPEN_RE = /^---\r?\n/;
const CLOSE_RE = /^---\r?\n|^---$/m;

export function splitFrontmatter(raw: string): FrontmatterSplit {
  const open = raw.match(OPEN_RE);
  if (!open) return { frontmatter: "", body: raw };
  const rest = raw.slice(open[0].length);
  const close = rest.match(CLOSE_RE);
  if (!close || close.index === undefined) return { frontmatter: "", body: raw };
  // The close delimiter must sit at a line start; regex is multiline-anchored.
  const end = open[0].length + close.index + close[0].length;
  return { frontmatter: raw.slice(0, end), body: raw.slice(end) };
}

export function joinFrontmatter(frontmatter: string, body: string): string {
  return frontmatter + body;
}
