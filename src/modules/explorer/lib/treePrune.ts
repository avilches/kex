import { pathBasename, pathDirname } from "@/lib/pathUtils";

// Child-dir nodes of `parent` that a fresh listing proves no longer exist.
//
// A listing taken with hidden files OFF omits dot-prefixed entries without
// implying they were deleted, so it must never drive their pruning: doing so
// would drop hidden dirs that still exist and, when the explorer root (or an
// ancestor of it) is hidden, would delete the root subtree and blank the tree.
// A filtered listing therefore never prunes dot-prefixed children.
export function removedChildDirs(
  parent: string,
  liveDirs: Set<string>,
  nodeKeys: Iterable<string>,
  showHidden: boolean,
): string[] {
  const removed: string[] = [];
  for (const key of nodeKeys) {
    if (pathDirname(key) !== parent || liveDirs.has(key)) continue;
    if (!showHidden && pathBasename(key).startsWith(".")) continue;
    removed.push(key);
  }
  return removed;
}
