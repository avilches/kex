export type FolderNode = { name: string; relPath: string; children: FolderNode[] };

export function buildFolderTree(folders: string[]): FolderNode[] {
  const roots: FolderNode[] = [];
  const byPath = new Map<string, FolderNode>();
  const sorted = [...folders].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
  for (const rel of sorted) {
    const slash = rel.lastIndexOf("/");
    const node: FolderNode = {
      name: slash === -1 ? rel : rel.slice(slash + 1),
      relPath: rel,
      children: [],
    };
    byPath.set(rel, node);
    const parent = slash === -1 ? undefined : byPath.get(rel.slice(0, slash));
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function nextFolderName(existingNames: string[]): string {
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  if (!taken.has("new folder")) return "New Folder";
  for (let i = 2; ; i++) {
    const candidate = `New Folder ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export function childFolders(folders: string[], parent: string): string[] {
  const prefix = parent === "" ? "" : `${parent}/`;
  return folders
    .filter((f) => {
      if (!f.startsWith(prefix)) return false;
      const rest = f.slice(prefix.length);
      return rest !== "" && !rest.includes("/");
    })
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

export function countDirectNotes(notes: { folder: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of notes) counts.set(n.folder, (counts.get(n.folder) ?? 0) + 1);
  return counts;
}
