export type OutlineHeading = { text: string; level: number; id: string };

// Shared with MilkdownEditor's heading-id-generator override so DOM ids and
// outline ids agree on the base slug (Milkdown's default generator keeps
// punctuation, which scrollToHeading would otherwise never match).
export function slugifyHeadingText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function headingsFromMarkdown(md: string): OutlineHeading[] {
  const out: OutlineHeading[] = [];
  const counts = new Map<string, number>();
  let inFence = false;
  for (const line of md.split("\n")) {
    if (/^(```|~~~)/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = m[2];
    const base = slugifyHeadingText(text);
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    out.push({ text, level: m[1].length, id: n === 0 ? base : `${base}-${n}` });
  }
  return out;
}
