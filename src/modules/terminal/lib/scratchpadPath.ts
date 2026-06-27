// Pure helpers for turning a dropped explorer path into a shell-friendly
// reference inserted in the scratchpad: relative to the terminal cwd, prefixed
// with `@`, and quoted only when the shell would otherwise mis-split it.

// Droppable id prefix for a scratchpad bar: `scratchpad:<leafId>`. Lives here so
// both the bar (builds the id) and the dnd provider (routes the drop) share it.
export const SCRATCHPAD_DROP_PREFIX = "scratchpad:";

function splitSegments(p: string): string[] {
  return p
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean);
}

const DRIVE_RE = /^[A-Za-z]:$/;

/**
 * Path of `target` relative to `cwd`, both absolute forward-slash paths.
 * Walks up with `..` when needed. Falls back to the absolute target when the
 * two live on different Windows drives (no relative path exists).
 */
export function toRelativePath(cwd: string, target: string): string {
  const a = splitSegments(cwd);
  const b = splitSegments(target);

  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;

  const aRoot = a[0];
  const bRoot = b[0];
  if (
    i === 0 &&
    aRoot !== undefined &&
    bRoot !== undefined &&
    aRoot !== bRoot &&
    DRIVE_RE.test(bRoot)
  ) {
    return target.replace(/\\/g, "/");
  }

  const up = a.length - i;
  const parts = [...Array<string>(up).fill(".."), ...b.slice(i)];
  return parts.length === 0 ? "." : parts.join("/");
}

// Anything outside this set makes a bare shell word ambiguous (spaces, globs,
// quotes, redirections, etc.), so the reference gets double-quoted. Mirrors the
// safe set used by quoteShellPath for terminal drops.
const SAFE_RE = /^[A-Za-z0-9_@%+=:,./-]+$/;

export function formatScratchpadRef(relPath: string): string {
  if (SAFE_RE.test(relPath)) return `@${relPath}`;
  const escaped = relPath.replace(/(["\\$`])/g, "\\$1");
  return `@"${escaped}"`;
}

export function scratchpadRefForDrop(cwd: string, target: string): string {
  return formatScratchpadRef(toRelativePath(cwd, target));
}
