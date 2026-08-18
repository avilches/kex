import { splitPath } from "@/lib/pathUtils";

function canon(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

// The vault's own config file and the temporaries beside it are written by this
// view, so reacting to them would re-read a folder on every interface change.
export function isSelfWrite(root: string, changedPath: string): boolean {
  const normRoot = canon(root);
  const normPath = canon(changedPath);
  if (normPath === `${normRoot}/kex.json`) return true;
  const base = normPath.slice(normPath.lastIndexOf("/") + 1);
  return base.startsWith(".tmp");
}

export function foldersToReload(
  root: string,
  changedPath: string,
  loaded: Iterable<string>,
): string[] {
  const normRoot = canon(root);
  const normPath = canon(changedPath);
  if (normPath !== normRoot && !normPath.startsWith(`${normRoot}/`)) return [];
  const rel = normPath.slice(normRoot.length).replace(/^\//, "");
  const [container] = splitPath(rel);
  const [grandparent] = splitPath(container);
  const candidates: string[] = rel === "" ? [""] : [rel, container, grandparent];
  const live = new Set(loaded);
  const out: string[] = [];
  for (const c of candidates) {
    if (live.has(c) && !out.includes(c)) out.push(c);
  }
  return out;
}
