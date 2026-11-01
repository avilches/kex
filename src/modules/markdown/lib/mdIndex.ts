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
      // A note created while the glob ran was added to the entry first: it stays.
      const found = res.hits.map((h) => h.path);
      entry.files = [...found, ...entry.files.filter((p) => !found.includes(p))];
      return entry.files;
    })
    .catch((err) => {
      console.error("wiki link index failed", err);
      // A failure is not kept for the rest of the session: the next surface asks again.
      if (INDEXES.get(root)?.entry === entry) INDEXES.delete(root);
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
  const entry = cached.entry;
  return cached.promise.then(() => entry.files);
}

export function reloadMarkdownIndex(root: string): Promise<string[]> {
  const entry = fetch(root);
  INDEXES.set(root, entry);
  return entry.promise;
}

export function markdownIndexAdd(root: string, path: string): void {
  const cached = INDEXES.get(root);
  // A new array, not a push: the hosts keep the list they were given in their state, and the same
  // reference would make their update a no-op.
  if (cached && !cached.entry.files.includes(path)) cached.entry.files = [...cached.entry.files, path];
}
