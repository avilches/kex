import { splitPath } from "@/lib/pathUtils";

function canon(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
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
    if (c === "" && live.has(c) && out.length > 1) continue;
    if (live.has(c) && !out.includes(c)) out.push(c);
  }
  return out;
}
