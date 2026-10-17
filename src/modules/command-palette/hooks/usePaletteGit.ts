import { useEffect, useSyncExternalStore } from "react";
import { demandDir, subscribeDirGit } from "@/modules/workspaces/lib/dirGitStore";

// Only tabs whose title uses {branch} ask git, so without this the branch and worktree of
// every other tab, and of any hibernated one, would be unknown to the palette's search.
export function demandPaletteDirs(dirs: Iterable<string>): () => void {
  const releases = [...new Set(dirs)].filter(Boolean).map((d) => demandDir(d));
  return () => {
    for (const r of releases) r();
  };
}

let version = 0;
let attached = 0;
let off: (() => void) | null = null;

function subscribe(l: () => void): () => void {
  if (attached++ === 0) {
    off = subscribeDirGit(() => {
      version++;
    });
  }
  const own = subscribeDirGit(l);
  return () => {
    own();
    if (--attached === 0) {
      off?.();
      off = null;
    }
  };
}

// Changes whenever any directory's branch changes; lets entries be rebuilt as answers arrive.
function useDirGitVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

export function usePaletteGit(open: boolean, dirs: readonly string[]): number {
  const key = [...new Set(dirs)].filter(Boolean).sort().join("\u0000");
  useEffect(() => (open ? demandPaletteDirs(key ? key.split("\u0000") : []) : undefined), [open, key]);
  return useDirGitVersion();
}
