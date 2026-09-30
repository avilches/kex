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

// The Preview shows the frontmatter as a fenced code block rather than hiding it.
export function frontmatterAsCodeBlock(raw: string): string {
  const { frontmatter, body } = splitFrontmatter(raw);
  if (!frontmatter) return raw;
  const inner = frontmatter.replace(OPEN_RE, "").replace(/\r?\n?---\r?\n?$/, "");
  const fence = inner.includes("```") ? "~~~~" : "```";
  return `${fence}yaml\n${inner}\n${fence}\n${body}`;
}
