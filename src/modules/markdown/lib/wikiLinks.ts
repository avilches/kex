import { native } from "@/lib/native";

export type WikiLinkEntry = { title: string; path: string };
export type WikiLinkContext = { entries: WikiLinkEntry[]; root: string };

export function resolveWikiRef(ref: string, ctx: WikiLinkContext): WikiLinkEntry | null {
  const titleForLookup = ref
    .replace(/#.*$/, "")
    .replace(/\^.*$/, "")
    .trim();
  if (titleForLookup.includes("/") && ctx.root) {
    const fullPath = `${ctx.root}/${titleForLookup}.md`;
    const byPath = ctx.entries.find((e) => e.path === fullPath);
    if (byPath) return byPath;
  }
  const titleOnly = titleForLookup.includes("/")
    ? (titleForLookup.split("/").pop() ?? titleForLookup)
    : titleForLookup;
  const titleLower = titleOnly.toLowerCase();
  const matches = ctx.entries.filter((e) => e.title.toLowerCase() === titleLower);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  return matches.reduce((a, b) => (a.path.split("/").length <= b.path.split("/").length ? a : b));
}

// Title = filename stem. Lazy, cheap: one fs_glob round-trip, built on demand
// when the wiki-link feature first needs it in a session.
export async function buildWikiLinkIndex(root: string): Promise<WikiLinkEntry[]> {
  const { hits } = await native.glob({ pattern: "**/*.md", root });
  return hits.map((hit) => {
    const norm = hit.path.replace(/\\/g, "/");
    const stem = (norm.split("/").pop() ?? norm).replace(/\.md$/i, "");
    return { title: stem, path: norm };
  });
}
