export type WikiLink = {
  from: number;
  to: number;
  // The note name, without the `#anchor` and the `|alias`.
  target: string;
  // Where the visible text starts: after `|` when there is an alias, else after `[[`.
  labelFrom: number;
};

const WIKI_AT = /^\[\[([^[\]|\n]+)(?:\|([^[\]\n]*))?\]\]/;

// The `[[target#anchor|alias]]` that starts exactly at `at` in `text`, or null.
export function wikiLinkAt(text: string, at: number): WikiLink | null {
  const m = WIKI_AT.exec(text.slice(at, at + 400));
  if (!m) return null;
  const target = m[1].split("#")[0].trim();
  if (target === "") return null;
  const alias = m[2];
  const labelFrom = alias === undefined ? at + 2 : at + m[0].length - 2 - alias.length;
  return { from: at, to: at + m[0].length, target, labelFrom };
}

const slashes = (s: string): string => s.replace(/\\/g, "/");
const normalize = (s: string): string => slashes(s).trim().replace(/\.md$/i, "").toLowerCase();

// Notes are matched by file name without extension, or by a trailing path
// (`folder/Note`), ignoring case. When several match, the shallowest wins.
export function resolveWikiTarget(target: string, root: string, files: readonly string[]): string | null {
  const want = normalize(target);
  if (want === "") return null;
  const base = slashes(root).replace(/\/+$/, "") + "/";
  let best: string | null = null;
  let bestDepth = Infinity;
  for (const file of files) {
    const f = slashes(file);
    const rel = normalize(f.startsWith(base) ? f.slice(base.length) : f);
    if (rel !== want && !rel.endsWith("/" + want)) continue;
    const depth = rel.split("/").length;
    if (depth < bestDepth || (depth === bestDepth && best !== null && file < best)) {
      best = file;
      bestDepth = depth;
    }
  }
  return best;
}
