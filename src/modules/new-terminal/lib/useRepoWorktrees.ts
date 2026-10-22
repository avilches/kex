import { useEffect, useState } from "react";
import { native } from "@/lib/native";
import type { RepoWorktree } from "./folderEntries";

// The checkouts of one repository, asked once per open palette. An unauthorized or
// non-repository folder simply has none: the palette just lacks those rows.
export function useRepoWorktrees(open: boolean, repoRoot: string): RepoWorktree[] {
  const [list, setList] = useState<RepoWorktree[]>([]);
  useEffect(() => {
    if (!open || !repoRoot) {
      setList([]);
      return;
    }
    let alive = true;
    native
      .gitListWorktrees(repoRoot)
      .then((found) => {
        if (alive) setList(found.map((w) => ({ path: w.path, branch: w.branch, isMain: w.isMain })));
      })
      .catch(() => {
        if (alive) setList([]);
      });
    return () => {
      alive = false;
    };
  }, [open, repoRoot]);
  return list;
}
