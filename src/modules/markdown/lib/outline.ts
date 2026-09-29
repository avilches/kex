import { frontmatterEnd } from "@/modules/markdown/codemirror/lib/frontmatterEnd";

// `line` is the 0-based line of the heading in the source markdown.
export type OutlineHeading = { text: string; level: number; id: string; line: number };

export function slugifyHeadingText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

export function headingsFromMarkdown(md: string): OutlineHeading[] {
  const out: OutlineHeading[] = [];
  const counts = new Map<string, number>();
  const skipUntil = frontmatterEnd(md);
  // A fence only closes with the same character, at least as long as the opener.
  let fence: { char: string; length: number } | null = null;
  let offset = 0;
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    offset += line.length + 1;
    if (lineStart < skipUntil) continue;
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open) {
      fence = { char: open[1][0], length: open[1].length };
      continue;
    }
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = m[2];
    const base = slugifyHeadingText(text);
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    out.push({ text, level: m[1].length, id: n === 0 ? base : `${base}-${n}`, line: i });
  }
  return out;
}
