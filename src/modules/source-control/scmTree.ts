import type { SourceControlEntry } from "./useSourceControlPanel";

export type ScmFileNode = { type: "file"; entry: SourceControlEntry };
export type ScmDirNode = {
  type: "dir";
  name: string;
  fullPath: string;
  children: ScmTreeNode[];
  fileCount: number;
};
export type ScmTreeNode = ScmDirNode | ScmFileNode;

export type ScmTreeRow =
  | { type: "dir"; key: string; depth: number; node: ScmDirNode }
  | { type: "file"; key: string; depth: number; entry: SourceControlEntry };

type RawNode = {
  dirs: Map<string, RawNode>;
  files: SourceControlEntry[];
};

function emptyRaw(): RawNode {
  return { dirs: new Map(), files: [] };
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

function byNameCI(a: string, b: string): number {
  return a.toLowerCase().localeCompare(b.toLowerCase());
}

function countFiles(children: ScmTreeNode[]): number {
  let total = 0;
  for (const child of children) {
    total += child.type === "file" ? 1 : child.fileCount;
  }
  return total;
}

function buildChildren(raw: RawNode, parentFull: string): ScmTreeNode[] {
  const dirs: ScmDirNode[] = [];
  for (const [seg, child] of raw.dirs) {
    const full = parentFull ? `${parentFull}/${seg}` : seg;
    dirs.push(makeDir(seg, full, child));
  }
  dirs.sort((a, b) => byNameCI(a.name, b.name));

  const files: ScmFileNode[] = raw.files.map((entry) => ({
    type: "file" as const,
    entry,
  }));
  files.sort((a, b) => byNameCI(basename(a.entry.path), basename(b.entry.path)));

  return [...dirs, ...files];
}

function makeDir(seg: string, fullPath: string, raw: RawNode): ScmDirNode {
  let name = seg;
  let full = fullPath;
  let cur = raw;
  // Compact single-child chains: a directory with exactly one subdirectory and
  // no files of its own merges its name into the child.
  while (cur.files.length === 0 && cur.dirs.size === 1) {
    const [childSeg, childRaw] = cur.dirs.entries().next().value as [
      string,
      RawNode,
    ];
    name = `${name}/${childSeg}`;
    full = `${full}/${childSeg}`;
    cur = childRaw;
  }
  const children = buildChildren(cur, full);
  return {
    type: "dir",
    name,
    fullPath: full,
    children,
    fileCount: countFiles(children),
  };
}

export function buildScmTree(entries: SourceControlEntry[]): ScmTreeNode[] {
  const root = emptyRaw();
  for (const entry of entries) {
    const segments = entry.path.split(/[\\/]/).filter(Boolean);
    if (segments.length <= 1) {
      root.files.push(entry);
      continue;
    }
    let node = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      let next = node.dirs.get(seg);
      if (!next) {
        next = emptyRaw();
        node.dirs.set(seg, next);
      }
      node = next;
    }
    node.files.push(entry);
  }
  return buildChildren(root, "");
}

export function flattenScmTree(
  nodes: ScmTreeNode[],
  collapsed: ReadonlySet<string>,
  depth = 0,
): ScmTreeRow[] {
  const rows: ScmTreeRow[] = [];
  for (const node of nodes) {
    if (node.type === "dir") {
      rows.push({ type: "dir", key: `dir:${node.fullPath}`, depth, node });
      if (!collapsed.has(node.fullPath)) {
        rows.push(...flattenScmTree(node.children, collapsed, depth + 1));
      }
    } else {
      rows.push({ type: "file", key: node.entry.key, depth, entry: node.entry });
    }
  }
  return rows;
}
