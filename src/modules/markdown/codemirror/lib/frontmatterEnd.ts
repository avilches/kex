import { splitFrontmatter } from "@/modules/markdown/lib/frontmatter";

// Frontmatter, if present, always starts at offset 0, so only a bounded prefix
// needs scanning; a multi-megabyte note must never be fully re-stringified on
// every decoration recompute just to check for a leading YAML block.
const PREFIX_SCAN_LENGTH = 4096;

export function frontmatterEnd(text: string): number {
  const prefix = text.slice(0, PREFIX_SCAN_LENGTH);
  const { frontmatter } = splitFrontmatter(prefix);
  return frontmatter.length;
}
