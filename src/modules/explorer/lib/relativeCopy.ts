export type RelativeCopy =
  | { ok: true; text: string }
  | { ok: false; reason: string };

function canon(p: string): string {
  const n = p.replace(/\\/g, "/").replace(/\/+$/, "");
  return n === "" ? "/" : n;
}

export function relativeCopyFor(
  path: string,
  workspaceRoot: string | null,
): RelativeCopy {
  if (workspaceRoot == null) return { ok: false, reason: "No workspace root" };
  const root = canon(workspaceRoot);
  const target = canon(path);
  if (target === root) return { ok: true, text: "." };
  const prefix = root === "/" ? "/" : `${root}/`;
  if (!target.startsWith(prefix)) {
    return { ok: false, reason: "Outside the workspace root" };
  }
  return { ok: true, text: target.slice(prefix.length) };
}
