import { useEffect, useRef, useState } from "react";
import { native } from "@/lib/native";
import type { RepoWorktree } from "./folderEntries";

const NONE: ReadonlyMap<string, readonly RepoWorktree[]> = new Map();

// The checkouts of every repository the palette lists, asked once per open palette and per
// top level. A folder the listing refuses to answer for (outside every workspace) is answered with
// an empty listing: its rows never offer the Tab hint, and its heading stops showing the spinner.
export function useRepoWorktrees(
  open: boolean,
  repoRoots: readonly string[],
): ReadonlyMap<string, readonly RepoWorktree[]> {
  const [byRepo, setByRepo] = useState<ReadonlyMap<string, readonly RepoWorktree[]>>(NONE);
  const asked = useRef(new Set<string>());
  const session = useRef(0);
  const key = [...new Set(repoRoots)].filter(Boolean).sort().join("\u0000");

  // biome-ignore lint/correctness/useExhaustiveDependencies: every open or close starts a new session
  useEffect(() => {
    session.current++;
    asked.current.clear();
    setByRepo(NONE);
  }, [open]);

  useEffect(() => {
    if (!open || !key) return;
    const mine = session.current;
    for (const root of key.split("\u0000")) {
      if (asked.current.has(root)) continue;
      asked.current.add(root);
      native
        .gitListWorktrees(root)
        .then((found) => {
          if (mine !== session.current) return;
          const list = found.map((w) => ({ path: w.path, branch: w.branch, isMain: w.isMain }));
          setByRepo((prev) => new Map(prev).set(root, list));
        })
        .catch(() => {
          if (mine !== session.current) return;
          setByRepo((prev) => new Map(prev).set(root, []));
        });
    }
  }, [open, key]);

  return byRepo;
}
