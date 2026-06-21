function splitName(name: string, kind: "file" | "dir"): [string, string] {
  if (kind === "dir") return [name, ""];
  const dot = name.lastIndexOf(".");
  if (dot > 0) return [name.slice(0, dot), name.slice(dot)];
  return [name, ""];
}

export function suggestDuplicateName(
  name: string,
  kind: "file" | "dir",
  siblings: string[],
): string {
  const [base, ext] = splitName(name, kind);
  const taken = new Set(siblings);
  const candidate = (n: number) =>
    n === 1 ? `${base} copy${ext}` : `${base} copy ${n}${ext}`;
  let n = 1;
  while (taken.has(candidate(n))) n++;
  return candidate(n);
}
