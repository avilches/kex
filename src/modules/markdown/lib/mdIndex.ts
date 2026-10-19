import { native } from "@/lib/native";

// Markdown file names under a root, fetched once and shared by every editor
// surface for that root (Live Preview tabs, preview panes). Each surface used
// to run its own 2000-result glob on mount.
type MdIndexEntry = { files: string[] };
const INDEXES = new Map<string, { entry: MdIndexEntry; promise: Promise<string[]> }>();
const MAX_INDEXED_ROOTS = 12;

function fetch(root: string): { entry: MdIndexEntry; promise: Promise<string[]> } {
  const entry: MdIndexEntry = { files: [] };
  const promise = native
    .glob({ pattern: "**/*.md", root, maxResults: 2000 })
    .then((res) => {
      entry.files = res.hits.map((h) => h.path);
      return entry.files;
    })
    .catch((err) => {
      console.error("wiki link index failed", err);
      return entry.files;
    });
  return { entry, promise };
}

export function markdownIndex(root: string): Promise<string[]> {
  let cached = INDEXES.get(root);
  if (!cached) {
    cached = fetch(root);
    INDEXES.set(root, cached);
    if (INDEXES.size > MAX_INDEXED_ROOTS) {
      const oldest = INDEXES.keys().next().value;
      if (oldest !== undefined) INDEXES.delete(oldest);
    }
  }
  return cached.promise;
}

export function reloadMarkdownIndex(root: string): Promise<string[]> {
  const entry = fetch(root);
  INDEXES.set(root, entry);
  return entry.promise;
}

export function markdownIndexAdd(root: string, path: string): void {
  const cached = INDEXES.get(root);
  if (cached) cached.entry.files.push(path);
}
