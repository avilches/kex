function normalizeSeparators(path: string): string {
  return path.replace(/\\/g, "/");
}

export function pathDirname(path: string): string {
  const p = normalizeSeparators(path);
  const i = p.lastIndexOf("/");
  if (i <= 0) return "/";
  return p.slice(0, i);
}

export function pathBasename(path: string): string {
  const p = normalizeSeparators(path);
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}
