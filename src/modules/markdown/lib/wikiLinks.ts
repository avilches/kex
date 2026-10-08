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

const BAD_SEGMENT = /[:*?"<>|\0]/;

export type NewWikiNote = { path: string } | { error: "invalid" | "outside" };

// Where `[[target]]` is created when no note has that name: relative to the
// note that holds the link, with `.md` added. `..` may climb as far as `root`
// and no further (`outside`); `a/../b` is just `b`. Anything that is not a
// plain relative file name is `invalid`.
export function newWikiNotePath(target: string, currentPath: string, root: string): NewWikiNote {
  const name = target.trim().replace(/\\/g, "/");
  if (name === "" || name.startsWith("/")) return { error: "invalid" };
  const parts = name.split("/");
  if (parts.some((s) => s.trim() !== s || BAD_SEGMENT.test(s))) return { error: "invalid" };
  if ([".", "..", ""].includes(parts[parts.length - 1])) return { error: "invalid" };
  const out = slashes(currentPath).replace(/\/[^/]*$/, "").split("/");
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  const base = slashes(root).replace(/\/+$/, "");
  const full = out.join("/");
  if (!full.startsWith(base + "/")) return { error: "outside" };
  return { path: /\.md$/i.test(full) ? full : `${full}.md` };
}
