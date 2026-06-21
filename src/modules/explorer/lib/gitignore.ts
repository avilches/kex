// Pure helpers for the "Add to .gitignore" explorer action. The orchestrator
// (App.tsx) shares these between the disk path and the open-buffer path so both
// compute the exact same entry and stay idempotent.

/**
 * The `.gitignore` line for a path inside a repo. Anchored with a leading slash
 * so it matches exactly this file/folder and not same-named entries elsewhere;
 * folders get a trailing slash. Returns null when the path is the repo root
 * itself or lies outside it.
 */
export function gitignoreEntryFor(
  repoRoot: string,
  path: string,
  isDir: boolean,
): string | null {
  if (path === repoRoot) return null;
  if (!path.startsWith(`${repoRoot}/`)) return null;
  const rel = path.slice(repoRoot.length + 1);
  if (!rel) return null;
  return `/${rel}${isDir ? "/" : ""}`;
}

/** True when `entry` already exists as its own line (ignoring surrounding whitespace). */
export function hasGitignoreEntry(content: string, entry: string): boolean {
  return content.split("\n").some((line) => line.trim() === entry);
}

/** Append `entry` as a trailing line, normalizing newline separation. */
export function appendGitignoreEntry(content: string, entry: string): string {
  if (content.length === 0) return `${entry}\n`;
  const sep = content.endsWith("\n") ? "" : "\n";
  return `${content}${sep}${entry}\n`;
}
