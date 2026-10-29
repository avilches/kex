import { useEffect, useState } from "react";
import { native } from "@/lib/native";
import { logicalRepoRoot } from "@/modules/workspaces/lib/explorerRoot";

// The repository root as the path the user opened the folder through: git reports the real
// location, so a folder under a symlink would otherwise fall "outside" its own repository.
export async function resolveLogicalRepoRoot(dir: string): Promise<string | null> {
  const [info, canonical] = await Promise.all([
    native.gitResolveRepo(dir).catch(() => null),
    native.canonicalize(dir).catch(() => dir),
  ]);
  return info?.repoRoot ? logicalRepoRoot(dir, canonical, info.repoRoot) : null;
}

// Asks only while mounted with a folder, which for a context menu means while it is open.
export function useLogicalRepoRoot(dir: string | undefined): string | null {
  const [found, setFound] = useState<{ dir: string; root: string | null } | null>(null);
  useEffect(() => {
    if (!dir) return;
    let cancelled = false;
    void resolveLogicalRepoRoot(dir).then((root) => {
      if (!cancelled) setFound({ dir, root });
    });
    return () => {
      cancelled = true;
    };
  }, [dir]);
  return dir && found?.dir === dir ? found.root : null;
}
